/**
 * Manage access to data, be it to find, update or remove it
 */
var document = require('./document')
  , events = require('events')
  , util = require('util')  
  , _ = require('lodash')
  ;


var INDEX_BUILDING_DEBOUNCE = 10;
var AUTO_INDEXING = true;


/**
 * Create a new cursor for this collection
 * @param {Datastore} db - The datastore this cursor is bound to
 * @param {Query} query - The query this cursor will operate on
 * @param {Function} execDn - Handler to be executed after cursor has found the results and before the callback passed to find/findOne/update/remove
 */
function Cursor (db, query, execFn) {
  this.db = db;
  this.query = query || {};
  if (execFn) { this.execFn = execFn; }
}


/**
 * Set a limit to the number of results
 */
Cursor.prototype.limit = function(limit) {
  this._limit = limit;
  return this;
};


/**
 * Skip a the number of results
 */
Cursor.prototype.skip = function(skip) {
  this._skip = skip;
  return this;
};


/**
 * Filter the results of the query - must be a function
 */
Cursor.prototype.filter = function(filter) {
  if (typeof(filter) != "function") return this;
  this._filter = filter;
  return this;
};


/**
 * Sort results of the query
 * @param {SortQuery} sortQuery - SortQuery is { field: order }, field can use the dot-notation, order is 1 for ascending and -1 for descending
 */
Cursor.prototype.sort = function(sortQuery) {
  this._sort = sortQuery;
  return this;
};


/**
 * Add the use of a projection
 * @param {Object} projection - MongoDB-style projection. {} means take all fields. Then it's { key1: 1, key2: 1 } to take only key1 and key2
 *                              { key1: 0, key2: 0 } to omit only key1 and key2. Except _id, you can't mix takes and omits
 */
Cursor.prototype.projection = function(projection) {
  this._projection = projection;
  return this;
};


/**
 * Apply the projection
 */
Cursor.prototype.project = function (candidates) {
  var res = [], self = this
    , keepId, action, keys
    ;

  if (this._projection === undefined || Object.keys(this._projection).length === 0) {
    return candidates;
  }

  keepId = this._projection._id === 0 ? false : true;
  this._projection = _.omit(this._projection, '_id');

  // Check for consistency
  keys = Object.keys(this._projection);
  keys.forEach(function (k) {
    if (action !== undefined && self._projection[k] !== action) { throw "Can't both keep and omit fields except for _id"; }
    action = self._projection[k];
  });

  // Do the actual projection
  candidates.forEach(function (candidate) {
    var toPush = action === 1 ? _.pick(candidate, keys) : _.omit(candidate, keys);
    if (keepId) {
      toPush._id = candidate._id;
    } else {
      delete toPush._id;
    }
    res.push(toPush);
  });

  return res;
};


/**
 * Get all matching elements
 * Will return pointers to matched elements (shallow copies), returning full copies is the role of find or findOne
 *
 * @param {Function} callback - Signature: err, results
 * @param {Boolean} countOnly
 */
Cursor.prototype.exec = function(callback, countOnly) {
  var res = [], self = this
    , err = null;

  var stream = Cursor.getMatchesStream(this.db, this.query, this._sort);
  stream.removeListener("ids", stream.trigger);
  stream.on("ids", function(ids) {
    var indexed = ids._indexed, sorted = ids._sorted; // for some reason we cannot access those in on 'ready' - maybe properties get erased from arrays?
    var doLimit = indexed && sorted && !self._filter;
    if (doLimit) ids = limit(ids, self._limit || ids.length, self._skip || 0);

    // No need to go further, sort and limits are applied, we only need count
    if (doLimit && countOnly) { res = ids; return ready(); }

    // Start retrieving the objects for those IDs
    stream.trigger(ids); 

    res = new Array(ids.length);
    stream.on("data", function(d) { res[d.idx] = d.val() });
    stream.on("ready", function() {
      try {
        if (!indexed) res = res.filter(function(x) { return document.match(x, self.query) });
        if (!sorted && self._sort) res = res.sort(Cursor.getSorter(self._sort));
        if (self._filter) res = res.filter(self._filter);
        if (!doLimit) res = limit(res, self._limit || res.length, self._skip || 0);
        res = self.project(res); // Drop that with LinvoDB
      } catch (e) { err = e; res = undefined };

      ready();
    });
  });

  function limit(res, limit, skip) { 
    return res.slice(skip, limit + skip);
  };

  function ready() {
    if (res && countOnly) res = res.length;
    if (typeof(self.execFn)=="function") return self.execFn(err, res, callback);
    else return callback(err, res);
  };
};


Cursor.prototype.count = function(callback) {
  return this.exec(callback, true);
};


/* Static methods, we don't want to expose those
 *
 * getMatchesStream - gets an event emitter that streams results from a query, all retrieved through indexes
 *  most queries can be fulfilled only via an index lookup
 *  this function, besides doing the query, makes sure that indexes are built for it before (auto-indexing)
 */
// var locked = {}, locks = {}; // we have to keep this somewhere; has to be on DB level
Cursor.getMatchesStream = function(db, query, sort) {
  var sort = sort || {};

  var stream = new events.EventEmitter();
  stream._closed = false;
  stream._waiting = null;

  stream.close = function() {
    stream._closed = true;
  };

  /* Retrieve IDs of the documents matched by the query; push to the pipe so we wait for existing index building to finish */
  process.nextTick(function(cb) {    
    var ids = Cursor.getIdsForQuery(db, query, sort);
    if (ids) return stream.emit("ids", ids);

    /* if getIdsForQuery returns null, then we have to re-build indexes 
     * Insert a simple timeout if the queue is empty in order to do debouncing */
    if (db._pipe.queue.length==0 && _.some(db.indexes, function(idx) { return !idx.ready }))
      db._pipe.push(function(cb) { setTimeout(cb, INDEX_BUILDING_DEBOUNCE) }, _.noop);

    db._pipe.push(db.buildIndexes.bind(db), function() { 
      ids = Cursor.getIdsForQuery(db, query, sort);
      if (ids) stream.emit("ids", ids);
      else stream.emit("error", new Error("getIdsForQuery returned null after index building"));
    });
  }, function() { });

  /* Stream the documents themselves: push all to the retriever queue */
  stream.on("ids", stream.trigger = function(ids) {
    stream._waiting = ids.length;
    if (! ids.length) return process.nextTick(function() { stream.emit("ready") });

    ids.forEach(function(id, i) { 
      db._retrQueue.push({ stream: stream, id: id, idx: i, db: db }, function() {
        if (--stream._waiting == 0) stream.emit("ready");
      });
    });
  });

  return stream;
};

Cursor.retriever = function(task, cb) {
  var locked = task.db._retrQueue._locked, 
      locks = task.db._retrQueue._locks;

  if (task.stream._closed) return cb();

  task.db.store.get(task.id, function(err, buf) {
    if (task.stream._closed) return cb();

    if (err) task.stream.emit("error", err);
    else task.stream.emit("data", {
      id: task.id, idx: task.idx,
      val: function() { 
        return new task.db(document.deserialize(buf));
      },
      lock: function() {
        if (! locks.hasOwnProperty(task.id)) locks[task.id] = 0;
        locks[task.id]++;
        return locked[task.id] = locked[task.id] || this.val();
      },
      unlock: function() {
        locks[task.id]--;
        if (! locks[task.id]) {
          delete locks[task.id];
          delete locked[task.id];
        }
      } 
    });

    cb();
  });
};


/*
 * Internal function
 * Run a complex query on indexes and return results
 */
Cursor.getIdsForQuery = function(db, query, sort) {
  var self = db;

  // Comparison operators: $lt $lte $gt $gte $in $nin $ne $regex $exists - all implemented
  // Logical operators: $or $and $not - all implemented

  // TODO: think about performance, how to minimize calls to _.union and _.intersection
  // best way to go would be lazy evaluation
  
  var indexed = true; // Is query fully indexed
  var sorted = true; // Query is sorted
  
  var res = null, excludes = [];

  var push = function(x) { res = res ? _.intersection(res, x) : _.uniq(x) }; // Push to results with _.intersection
  var exclude = function(x) { excludes = _.union(excludes, x) }; 

  // TODO; change the logic here when we have compound indexes
  var firstKey = _.first(_.keys(sort));
  sorted = firstKey ? (!!db.indexes[firstKey] && _.keys(sort).length==1) : true;
  
  if (sort) _.each(sort, function(value, key) {
    match(key, query[key]); // If there's no query key, the value will be undefined
    
    // Flip results, descending order
    if (key==firstKey && value == -1) res = res.reverse();

    // Apply all the sort keys first, effectively allowing results to be sorted by first sort key
    // In order to implement compound sort here, we need compound indexes
  });

  // Match all keys in the query except the sort keys, since we've done this already in the sort loop
  _.each(query, function(value, key) {
    if (sort && sort[key]) return;
    match(key, value);
  });

  // The matcher itself
  function match(key, value) {
    // Handle logical operators
    if (key[0] == "$") {
      if ((key=="$and" || key=="$or") && util.isArray(value)) {
        var i = value.map(function(q) { return Cursor.getIdsForQuery(db, q) });
        var fn = key=="$and" ? _.intersection : _.union; // Merging function

        if (i.indexOf(null)>-1) indexed = false;
        else push(fn.apply(_, i));
      }
      
      if (key=="$not") {
        var i = Cursor.getIdsForQuery(db, value);
        
        if (i === null) indexed = false;
        else exclude(i);
      }

      // TODO: emit error here on "else"
      return;
    };
    
    // The query is not fully indexed - set the flag and build the index 
    if (! (db.indexes[key] && db.indexes[key].ready)) {
      indexed = false;
      if (db.options.autoIndexing) db.ensureIndex({ fieldName: key });
    };

    // 1) We can utilize this index and 2) we should
    var index = db.indexes[key];
    if (index && (indexed || !db.options.autoIndexing)) {
      if (value===undefined) return push(index.getAll()); // Useful when we invoke match() in sort loop
      if (document.isPrimitiveType(value)) return push(index.getMatching(value));
      if (typeof(value)=="object" && !_.keys(value).some(function(k) { return document.comparators[k] })) return push(index.getMatching(value));

      // Those can be combined
      if (value && value.hasOwnProperty("$ne")) exclude(index.getMatching(value.$ne));
      if (value && value.hasOwnProperty("$in")) push(index.getMatching(value.$in));
      if (value && value.hasOwnProperty("$nin")) exclude(index.getMatching(value.$nin));
      if (value && value.hasOwnProperty("$lt") || value.hasOwnProperty("$lte") || value.hasOwnProperty("$gt") || value.hasOwnProperty("$gte")) push(index.getBetweenBounds(value));
      if (value && value.hasOwnProperty("$exists") && value.$exists==true) push(index.getAll(function(n) { return n.key!==undefined }));
      if (value && value.hasOwnProperty("$exists") && value.$exists==false) push(index.getAll(function(n) { return n.key===undefined })); 
      if (value && value.hasOwnProperty("$regex")) { var r = new RegExp(value.$regex); push(index.getAll(function(n) { return n.key && n.key.match(r) })); }
    };
  };

  if (!indexed && db.options.autoIndexing) return null;
  res = _.difference(res || self.getAllData(), excludes);
  res._indexed = indexed;
  res._sorted = sorted;
  return res;
};

/* 
 * Internal function to help sorting in case getIdsForQuery doesn't return sorted results
 */
Cursor.getSorter = function(sort) {
  var criteria = _.map(sort, function(val, key) { return { key: key, direction: val } });
  return function(a, b) {
    var criterion, compare, i;
    for (i = 0; i < criteria.length; i++) {
      criterion = criteria[i];
      compare = criterion.direction * document.compareThings(document.getDotValue(a, criterion.key), document.getDotValue(b, criterion.key));
      if (compare !== 0) {
        return compare;
      }
    }
    return 0;
  };
};

// Interface
module.exports = Cursor;
