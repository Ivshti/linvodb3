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
 */
Cursor.prototype.exec = function(callback) {
  var res = [], added = 0, skipped = 0, self = this
    , error = null
    , i, keys, key
    ;

  this.db.getCandidates(this.query, this.sort, function(candidates) {
    try {
      for (i = 0; i < candidates.length; i += 1) {
        if (document.match(candidates[i], self.query)) {
          // If a sort is defined, wait for the results to be sorted before applying limit and skip
          if (!self._sort) {
            if (self._skip && self._skip > skipped) {
              skipped += 1;
            } else {
              res.push(candidates[i]);
              added += 1;
              if (self._limit && self._limit <= added) { break; }
            }
          } else {
            res.push(candidates[i]);
          }
        }
      }
    } catch (err) {
      return callback(err);
    }

    // Apply all sorts
    if (self._sort) {
      keys = Object.keys(self._sort);

      // Sorting
      var criteria = [];
      for (i = 0; i < keys.length; i++) {
        key = keys[i];
        criteria.push({ key: key, direction: self._sort[key] });
      }
      res.sort(function(a, b) {
        var criterion, compare, i;
        for (i = 0; i < criteria.length; i++) {
          criterion = criteria[i];
          compare = criterion.direction * document.compareThings(document.getDotValue(a, criterion.key), document.getDotValue(b, criterion.key));
          if (compare !== 0) {
            return compare;
          }
        }
        return 0;
      });

      // Applying limit and skip
      var limit = self._limit || res.length
        , skip = self._skip || 0;

      res = res.slice(skip, skip + limit);
    }

    // Apply projection
    try {
      res = self.project(res);
    } catch (e) {
      error = e;
      res = undefined;
    }

    if (typeof(self.execFn)=="function") {
      return self.execFn(error, res, callback);
    } else {
      return callback(error, res);
    }
  });
};

/* Static methods, we don't want to expose those
 *
 * getMatchesStream - gets an event emitter that streams results from a query, all retrieved through indexes
 *  most queries can be fulfilled only via an index lookup
 *  this function, besides doing the query, makes sure that indexes are built for it before (auto-indexing)
 */
// var locked = {}, locks = {}; // we have to keep this somewhere
Cursor.getMatchesStream = function(db, query, sort) {
  var sort = sort || {};

  var stream = new events.EventEmitter();
  var closed;

  /* Retrieve IDs of the documents matched by the query; push to the pipe so we wait for existing index building to finish */
  process.nextTick(function(cb) {    
    var ids = Cursor.getIdsForQuery(db, query);
    if (ids) return stream.emit("ids", ids);

    /* if getIdsForQuery returns null, then we have to re-build indexes 
     * Insert a simple timeout if the queue is empty in order to do debouncing */
    if (db._pipe.queue.length==0 && _.some(db.indexes, function(idx) { return !idx.ready }))
      db._pipe.push(function(cb) { setTimeout(cb, INDEX_BUILDING_DEBOUNCE) }, _.noop);

    db._pipe.push(db.buildIndexes.bind(db), function() { 
      ids = Cursor.getIdsForQuery(db, query);
      if (ids) stream.emit("ids", ids);
      else stream.emit("error", new Error("getIdsForQuery retruned null after index building"));
    });
  }, function() { });

  /* Stream the documents themselves */
  stream.on("ids", function(ids) {

  });

  return stream;
};

Cursor.getIdsForQuery = function(db, query, sort) {
  var self = db;

  // Comparison operators: $lt $lte $gt $gte $ne $in $nin $regex $exists $size 
  // Logical operators: $or $and $not $where

  
  var indexed = true; // Is query fully indexed
  
  var res = null, excludes = [];

  if (sort) {
    // TODO; set res as all results from the sort index
  };

  var push = function(x) { res = res ? _.intersection(res, x) : x }; // Push to results with _.intersection
  _.each(query, function(value, key) {
    if (key[0] == "$") {
      return; // TODO logical operators
      // call getIdsForQuery recursively for logicals, but careful if it returns null
    };
    
    // The query is not fully indexed - set the flag and build the index 
    if (! (db.indexes[key] && db.indexes[key].ready)) {
      indexed = false;
      if (db.options.autoIndexing) db.ensureIndex({ fieldName: key });
    };

    // 1) We can utilize this index and 2) we should
    var index = db.indexes[key];
    if (index && (indexed || !db.options.autoIndexing)) {
      if (document.isPrimitiveType(value)) push(index.getMatching(value));
      else if (value.hasOwnProperty("$in")) push(index.getMatching(value.$in));
      else if (value.hasOwnProperty("$lt") || value.hasOwnProperty("$lte") || value.hasOwnProperty("$gt") || value.hasOwnProperty("$gte")) push(index.getBetweenBounds(value));
    };
  });

  if (!indexed && db.options.autoIndexing) return null;
  return _.difference(res || self.getAllData(), excludes);
};



// Interface
module.exports = Cursor;
