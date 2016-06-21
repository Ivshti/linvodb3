/**
 * Manage access to data, be it to find, update or remove it
 */
var document = require('./document')
  , events = require('events')
  , util = require('util')
  , _ = require('underscore')
  ;


var INDEX_BUILDING_DEBOUNCE = 10;
var LIVE_QUERY_DEBOUNCE = 30;
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
 * Re-define the query itself; used for live queries
 */
Cursor.prototype.find = function(query) {
  this.query = query || this.query;
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
 * Add the use of a mapping function
 * @param {Function} map - map function, takes the object as the first argument
 */
Cursor.prototype.map = function(map) {
  if (typeof(map)=="function") this._map = map;
  return this;
};

/**
 * Add the use of a reducing function
 * @param {Function} reduce - reduce function, takes the two objects
 */
Cursor.prototype.reduce = function(reduce, initial) {
  if (typeof(reduce)=="function") {
    this._reduce = initial===undefined ? [reduce] : [reduce,initial];
  }
  return this;
};


/**
 * Aggregating function
 */
Cursor.prototype.aggregate = function(aggr) {
  this._aggregate = aggr;
  return this;
};

/**
 * Get all matching elements
 * Will return pointers to matched elements (shallow copies), returning full copies is the role of find or findOne
 *
 * @param {Function} callback - Signature: err, results
 */
Cursor.prototype.exec = function(callback) {
  var res = [], resIds = {}, resById = {}, self = this
    , err = null;

  var sort, sorter;
  if (typeof(this._sort) == "function") sorter = this._sort;
  else sort = this._sort;

  var reducer;
  if (self._reduce) reducer = [].concat(self._reduce);
  if (reducer && reducer[1]) reducer[1] = document.deepCopy(self._reduce[1]);  // we have to copy the initial value, so that we don't inherit old vals

  if (! this._quiet) this.db.emit("query", this.query);

  var stream = Cursor.getMatchesStream(this.db, this.query, sort, this._prefetched);
  stream.on("error", function(e) { callback(e) });
  stream.removeListener("ids", stream.trigger);
  stream.on("ids", function(ids) {
    var indexed = ids._indexed, sorted = ids._sorted; // for some reason we cannot access those in on 'ready' - maybe properties get erased from arrays?
    var earlyLimit = indexed && sorted && !self._filter && !sorter; // query is indexed, sorter and we don't have special filter/sort funcs; TODO: we should also set this to true if there's no limit/skip
    var earlySort = (sorted || !sort) && !sorter; // If ids are already sorted
    var earlyMapReduce = earlyLimit && earlySort && self._map && reducer; // special mode - run the map/reduce directly on data event
    // TODO: earlyMapReduce even without the map

    if (earlyLimit) ids = limit(ids, self._limit || ids.length, self._skip || 0);

    // No need to go further, sort and limits are applied, we only need count
    if (earlyLimit && self._count) { res = ids; return ready(); }

    // Start retrieving the objects for those IDs; res is an array that will hold all results
    stream.trigger(ids);
    res = new Array(ids.length);

    // Special case: res becomes the cursor of reduce if we're running a map/reduce
    if (earlyMapReduce) res = reducer[1] || undefined;

    // Error catcher
    var catcher = function(e) { stream.close(); err = e; res = undefined };

    stream.on("data", function(d) {
      var v = d.val();

      if (!indexed && !document.match(v, self.query)) return; // Check documents for match if query is not full-index

      // WARNING: maybe we can put this entire block in try-catch but then we have to make absolutely sure that we're not going to throw errors
      // and the only place it can come from is _filter, _map or reducer

      try {
      if (self._filter && !self._filter(v)) return; // Apply filter
      } catch(e) { catcher(e) }

      if (self._live) { resById[v._id] = v; resIds[v._id] = true; } // Keep those in a map if we need them for a live query

      if (earlyMapReduce) { // The early map-reduce system, map/reduce-es results on the go if we can (results are pre-sorted and limited)
        try {
          v = self._map(v);
          res = res===undefined ? v : reducer[0](res, v);
        } catch (e) { catcher(e) }
        return;
      }

      if (res) res[d.idx] = v; // res might have been set to undefined because of an error

      if (self._ondata) self._ondata(v);
    });
    stream.on("ready", function() {
      if (err) return ready();

      if (self._live) { self._ids = resIds; } // We need those for the live query
      self._prefetched = resById; // also keep this on a regular cursor; no harm done, it will be released once the cursor is let go

      if (earlyMapReduce) return ready();

      try {
        res = res.filter(function(x) { return x !== null }); // Remove holes left by document.match/filter

        if (!earlySort) res = res.sort(sorter || Cursor.getSorter(sort));
        if (!earlyLimit) res = limit(res, self._limit || res.length, self._skip || 0);

        if (self._map) res = res.map(function(v) { return self._map(v) });
        if (reducer) res = res.reduce.apply(res, reducer);
      } catch (e) { err = e; res = undefined };

      ready();
    });
  });

  function limit(res, limit, skip) {
    return res.slice(skip, limit + skip);
  };

  function ready() {
    if (res && self._count) res = res.length;
    if (res && self._aggregate) res = self._aggregate(res);

    if (typeof(self.execFn)=="function") return self.execFn(err, res, callback);
    else return callback(err, res);
  };
};


Cursor.prototype.count = function(callback) {
  this._count = true;
  if (callback) this.exec(callback);
  return this;
};


// Make the cursor into a live query
Cursor.prototype.live = function(query) {
  var self = this;

  if (query !== undefined) this.query = query;
  if (this._live) { this.refresh(); return this; } // Live query already initialized; refresh

  this._live = true;
  this._ids = {}; this._prefetched = {};
  this.res = undefined;

  // Refresh live query
  var refresh = _.debounce(function(callback) {
    self.exec(function(err, res) {
      if (err) console.error(err); // No other way for now
      self.res = res;
      self.db.emit("liveQueryUpdate", self.query);
      if (typeof(callback)=="function") callback();
    });
  }, self.db.options.liveQueryDebounce || LIVE_QUERY_DEBOUNCE);
  refresh();

  // Watch for changes
  function updated(docs) {
    // Refresh if any of the objects: have an ID which is in our results OR they match our query (this.query)
    var shouldRefresh = false;
    docs.forEach(function(doc) { // Avoid using .some since it would stop iterating after first match and we need to set _prefetched
      var interested = self._count || self._ids[doc._id] || document.match(doc, self.query); // _count queries never set _ids
      if (interested) self._prefetched[doc._id] = doc;
      shouldRefresh = shouldRefresh || interested;
    });
    if (shouldRefresh) refresh();
  };
  function removed(ids) {
    // Refresh if any of the objects: have an ID which is in our results
    if (ids.some(function(id) {
      return self._ids[id];
    })) refresh();
  };
  function stop() {
    self._live = false;
    delete self.refresh;
    delete self.stop;

    this.db.removeListener("updated", updated);
    this.db.removeListener("inserted", updated);
    this.db.removeListener("removed", removed);
    this.db.removeListener("reload", refresh);
    this.db.removeListener("liveQueryRefresh", refresh);
  }

  this.db.on("updated", updated);
  this.db.on("inserted", updated);
  this.db.on("removed", removed);
  this.db.on("reload", refresh); // Refresh on DB reload
  this.db.on("liveQueryRefresh", refresh); // Refresh on this event

  self.refresh = refresh;
  self.stop = stop;

  return this;
};

Cursor.prototype.stream = function(ondata, callback) {
  this._ondata = ondata;
  this.exec(callback);
};


/* Static methods, we don't want to expose those
 *
 * getMatchesStream - gets an event emitter that streams results from a query, all retrieved through indexes
 *  most queries can be fulfilled only via an index lookup
 *  this function, besides doing the query, makes sure that indexes are built for it before (auto-indexing)
 *
 * prefetched - a hash map of ID->constructed object which we have pre-fetched somehow - previous results from a live query
 */
Cursor.getMatchesStream = function(db, query, sort, prefetched) {
  var sort = sort || {};

  var stream = new events.EventEmitter();
  stream._closed = false;
  stream._waiting = null;

  stream.close = function() {
    stream._closed = true;
  };

  /* Retrieve IDs of the documents matched by the query; push to the pipe so we wait for existing index building to finish */
  setTimeout(function(cb) {
    try { // If the query fails, it will happen now, no need to re-catch it later
      var ids = Cursor.getIdsForQuery(db, query, sort);
      if (ids) return stream.emit("ids", ids);
    } catch (e) { return stream.emit("error", e); }

    /* if getIdsForQuery returns null, then we have to re-build indexes
     * Insert a simple timeout if the queue is empty in order to do debouncing */
    if (db._pipe.queue.length==0 && _.some(db.indexes, function(idx) { return !idx.ready }))
      db._pipe.push(function(cb) { setTimeout(cb, db.options.indexBuildingDebounce || INDEX_BUILDING_DEBOUNCE) }, _.noop);

    db._pipe.push(db.buildIndexes.bind(db), function() {
      ids = Cursor.getIdsForQuery(db, query, sort);
      if (ids) stream.emit("ids", ids);
      else stream.emit("error", new Error("getIdsForQuery returned null after index building"));
    });
  }, function() { });

  /* Stream the documents themselves: push all to the retriever queue */
  stream.on("ids", stream.trigger = function(ids) {
    stream._waiting = ids.length;
    if (! ids.length) return setTimeout(function() { stream.emit("ready") });

    ids.forEach(function(id, i) {
      db._retrQueue.push(function(cb) {
        Cursor.retriever({ stream: stream, id: id, idx: i, db: db, prefetched: prefetched && prefetched[id] }, function() {
         if (--stream._waiting == 0) stream.emit("ready");
         cb();
        });
      });

    });
  });

  return stream;
};

Cursor.retriever = function(task, cb) {
  var locked = task.db._retrQueue._locked,
      locks = task.db._retrQueue._locks;

  if (task.stream._closed) return cb();

  if (task.prefetched) return setTimeout(function() { task.stream.emit("data", {
    id: task.id, idx: task.idx, val: function() { return task.prefetched },
    lock: _.noop, unlock: _.noop
  }); return cb(); });

  task.db.store.get(task.id, function(err, buf) {
    if (task.stream._closed) return cb();

    // quietly ignore that one for now, since it's possible to do a .remove while a query is happening
    // ugly workaround; TODO: fix 
    if (err && err.type == "NotFoundError") return cb();

    if (err) task.stream.emit("error", err);
    else task.stream.emit("data", {
      id: task.id, idx: task.idx,
      val: function() {
        return new task.db(buf);
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
  var sorted = true; // Query- is sorted

  var res = null, excludes = [];

  var push = function(x) { res = res ? _.intersection(res, x) : _.uniq(x) }; // Push to results with _.intersection
  var exclude = function(x) { excludes = _.union(excludes, x) };

  // TODO; change the logic here when we have compound indexes
  var firstKey = _.first(_.keys(sort));
  sorted = firstKey ? (!!db.indexes[firstKey] && _.keys(sort).length==1) : true;

  if (sort) _.each(sort, function(value, key) {
    match(key, query[key]); // If there's no query key, the value will be undefined

    if (! sorted) return; // We need this to be active in order to avoid empty res

    // Flip results, descending order
    if (key==firstKey && value == -1 && res) res = res.reverse();

    // Apply all the sort keys first, effectively allowing results to be sorted by first sort key
    // In order to implement compound sort here, we need compound indexes
  });

  // Match all keys in the query except the sort keys, since we've done this already in the sort loop
  _.each(query, function(value, key) {
    if (sort && sort[key]) return;
    match(key, value);
  });

  // The matcher itself
  function match(key, val) {
    // Handle logical operators
    if (key[0] == "$") {
      if (key=="$and" || key=="$or") {
        if (!util.isArray(val))  { throw key+" operator used without an array" };

        var i = val.map(function(q) { return Cursor.getIdsForQuery(db, q) });
        var fn = key=="$and" ? _.intersection : _.union; // Merging function

        if (i.indexOf(null)>-1) indexed = false;
        else push(fn.apply(_, i));
      }

      if (key=="$not") {
        var i = Cursor.getIdsForQuery(db, val);

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
      if (val===undefined) return push(index.getAll()); // Useful when we invoke match() in sort loop
      if (document.isPrimitiveType(val)) return push(index.getMatching(val));
      if (typeof(val)=="object" && !_.keys(val).some(function(k) { return document.comparators[k] })) return push(index.getMatching(val));

      // Those can be combined
      if (val && val.hasOwnProperty("$ne")) exclude(index.getMatching(val.$ne));
      if (val && val.hasOwnProperty("$in")) push(index.getMatching(val.$in));
      if (val && val.hasOwnProperty("$nin")) exclude(index.getMatching(val.$nin));
      if (val && val.hasOwnProperty("$lt") || val.hasOwnProperty("$lte") || val.hasOwnProperty("$gt") || val.hasOwnProperty("$gte")) push(index.getBetweenBounds(val));
      if (val && val.hasOwnProperty("$exists") && val.$exists==true) push(index.getAll(function(n) { return n.key!==undefined }));
      if (val && val.hasOwnProperty("$exists") && val.$exists==false) push(index.getAll(function(n) { return n.key===undefined }));
      if (val && val.hasOwnProperty("$regex")) { var r = val.$regex; push(index.getAll(function(n) { return n.key && n.key.match(r) })); }
    };
  };

  if (!indexed && db.options.autoIndexing) return null;
  if (!res && !db.indexes._id.ready) return false;
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
