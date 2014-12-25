var customUtils = require('./customUtils')
  , document = require('./document')
  , async = require('async')
  , bagpipe = require('bagpipe')
  , Index = require('./indexes')
  , util = require('util')
  , path = require('path')
  , _ = require('lodash')
  , Cursor = require('./cursor')
  , levelup = require('levelup')
  ;

var LEVELUP_RETR_CONCURRENCY = 10; // We'll use that on a bagpipe instance regulating findById
var INDEX_BUILDING_DEBOUNCE = 40;

var stores = {}; // We have to keep those unique by filename because they're locked

/**
 * Create a new model
*/
function Datastore (options) {
  this.filename = path.normalize(options.filename);

  // LevelUP ; the safety we have here to re-use instance is right now only because of the tests
  this.store = stores[options.filename];
  this.store = stores[options.filename] = (this.store && this.store.isOpen()) ? this.store : levelup(options.filename, options.store || { });

  // Indexed by field name, dot notation can be used
  // _id is always indexed and since _ids are generated randomly the underlying
  // binary is always well-balanced
  this.indexes = {};
  this.indexes._id = new Index({ fieldName: '_id', unique: true });

  this._pipe = new bagpipe(1);
}


/**
 * Load the database and re-build indexes
 */
Datastore.prototype.loadDatabase = function (cb) {
  this.resetIndexes();
  this._pipe.push(this.buildIndexes.bind(this), function() {
    cb(null);
  });
};

/**
 * Build new indexes from a full scan
 */
Datastore.prototype.buildIndexes = function (cb) {
  var self = this;

  var toBuild = _.filter(self.indexes, function(idx) { return !idx.ready });
  if (! toBuild.length) return cb(null);

  // Rebuild the new indexes
  _.each(toBuild, function(idx) { idx.reset() });

  self.store.createReadStream()
  .on("data", function (data) {
    var doc = document.deserialize(data.value); // WARNING; the first part of this is totally temporary, until we remove in-memory data
    _.each(toBuild, function(idx) { idx.insert(doc) });
  })
  .on("end", function() {
    _.each(toBuild, function(idx) { idx.ready = true });
    cb(null);
  });
};


/**
 * Get an array of all the data in the database
 */
Datastore.prototype.getAllData = function () {
  return this.indexes._id.getAll();
};


/**
 * Reset all currently defined indexes
 */
Datastore.prototype.resetIndexes = function () {
  var self = this;
  Object.keys(this.indexes).forEach(function (i) {
    self.indexes[i].reset();
  });
};


/**
 * Ensure an index is kept for this field. Same parameters as lib/indexes
 * For now this function is synchronous, we need to test how much time it takes
 * We use an async API for consistency with the rest of the code
 * @param {String} options.fieldName
 * @param {Boolean} options.unique
 * @param {Boolean} options.sparse
 * @param {Function} cb Optional callback, signature: err
 */
Datastore.prototype.ensureIndex = function (options, cb) {
  var callback = cb || function () {};

  options = options || {};

  if (!options.fieldName) { return callback({ missingFieldName: true }); }
  if (this.indexes[options.fieldName]) { return callback(null); }

  this.indexes[options.fieldName] = new Index(options);

  try {
    this.indexes[options.fieldName].insert(this.getAllData());
  } catch (e) {
    delete this.indexes[options.fieldName];
    return callback(e);
  }

  callback(null);
};


/**
 * Remove an index
 * @param {String} fieldName
 * @param {Function} cb Optional callback, signature: err 
 */
Datastore.prototype.removeIndex = function (fieldName, cb) {
  var callback = cb || function () {};
  
  delete this.indexes[fieldName];  
  callback(null);
};


/**
 * Add one or several document(s) to all indexes
 */
Datastore.prototype.addToIndexes = function (doc) {
  var i, failingIndex, error
    , keys = Object.keys(this.indexes)
    ;

  for (i = 0; i < keys.length; i += 1) {
    try {
      this.indexes[keys[i]].insert(doc);
    } catch (e) {
      failingIndex = i;
      error = e;
      break;
    }
  }

  // If an error happened, we need to rollback the insert on all other indexes
  if (error) {
    for (i = 0; i < failingIndex; i += 1) {
      this.indexes[keys[i]].remove(doc);
    }

    throw error;
  }
};


/**
 * Remove one or several document(s) from all indexes
 */
Datastore.prototype.removeFromIndexes = function (doc) {
  var self = this;

  Object.keys(this.indexes).forEach(function (i) {
    self.indexes[i].remove(doc);
  });
};


/**
 * Update one or several documents in all indexes
 * To update multiple documents, oldDoc must be an array of { oldDoc, newDoc } pairs
 * If one update violates a constraint, all changes are rolled back
 */
Datastore.prototype.updateIndexes = function (oldDoc, newDoc) {
  var i, failingIndex, error
    , keys = Object.keys(this.indexes)
    ;

  for (i = 0; i < keys.length; i += 1) {
    try {
      this.indexes[keys[i]].update(oldDoc, newDoc);
    } catch (e) {
      failingIndex = i;
      error = e;
      break;
    }
  }

  // If an error happened, we need to rollback the update on all other indexes
  if (error) {
    for (i = 0; i < failingIndex; i += 1) {
      this.indexes[keys[i]].revertUpdate(oldDoc, newDoc);
    }

    throw error;
  }
};


/**
 * Return the list of candidates for a given query
 * Crude implementation for now, we return the candidates given by the first usable index if any
 * We try the following query types, in this order: basic match, $in match, comparison match
 * One way to make it better would be to enable the use of multiple indexes if the first usable index
 * returns too much data. I may do it in the future.
 *
 * TODO: needs to be moved to the Cursor module
 */
Datastore.prototype.getCandidates = function (query, sort, callback) {
  var self = this;

  // Empty queue, insert a simple timeout in order to do debouncing
  if (self._pipe.queue.length==0 && _.some(self.indexes, function(idx) { return !idx.ready }))
    self._pipe.push(function(cb) { setTimeout(cb, INDEX_BUILDING_DEBOUNCE) }, _.noop);

  self._pipe.push(self.buildIndexes.bind(self), function() {
    var indexNames = Object.keys(self.indexes)
      , usableQueryKeys;

    // For a basic match
    usableQueryKeys = [];
    Object.keys(query).forEach(function (k) {
      if (typeof query[k] === 'string' || typeof query[k] === 'number' || typeof query[k] === 'boolean' || util.isDate(query[k]) || query[k] === null) {
        usableQueryKeys.push(k);
      }
    });
    usableQueryKeys = _.intersection(usableQueryKeys, indexNames);
    if (usableQueryKeys.length > 0) {
      return callback(self.indexes[usableQueryKeys[0]].getMatching(query[usableQueryKeys[0]]));
    }

    // For a $in match
    usableQueryKeys = [];
    Object.keys(query).forEach(function (k) {
      if (query[k] && query[k].hasOwnProperty('$in')) {
        usableQueryKeys.push(k);
      }
    });
    usableQueryKeys = _.intersection(usableQueryKeys, indexNames);
    if (usableQueryKeys.length > 0) {
      return callback(self.indexes[usableQueryKeys[0]].getMatching(query[usableQueryKeys[0]].$in));
    }

    // For a comparison match
    usableQueryKeys = [];
    Object.keys(query).forEach(function (k) {
      if (query[k] && (query[k].hasOwnProperty('$lt') || query[k].hasOwnProperty('$lte') || query[k].hasOwnProperty('$gt') || query[k].hasOwnProperty('$gte'))) {
        usableQueryKeys.push(k);
      }
    });
    usableQueryKeys = _.intersection(usableQueryKeys, indexNames);
    if (usableQueryKeys.length > 0) {
      return callback(self.indexes[usableQueryKeys[0]].getBetweenBounds(query[usableQueryKeys[0]]));
    }

    // By default, return all the DB data
    return callback(self.getAllData());
  });

};


/**
 * Insert a new document
 * @param {Function} cb Optional callback, signature: err, insertedDoc
 *
 */
Datastore.prototype.insert = function (newDoc, cb) {
  var callback = cb || function () {}
    , self = this
    ;

  // This is a suboptimal way to do it, but wait for indexes to be up to date in order to avoid mid-insert index reset
  // We actually have to lock all operations while doing buildIndex; consider bringing back executor
  self._pipe.push(function(callback) {
    try {
      self._insertInIdx(newDoc);
    } catch (e) {
      return callback(e);
    }

    // Persist in LevelUP
    async.each(util.isArray(newDoc) ? newDoc : [newDoc], function(d, cb) { 
      self.store.put(d._id, document.serialize(d), cb);
    }, function(err) {
      callback(err || null, err ? undefined : newDoc);
    });
  }, callback);

};

/**
 * Create a new _id that's not already in use
 */
Datastore.prototype.createNewId = function () {
  var tentativeId = customUtils.uid(16);
  // Try as many times as needed to get an unused _id. As explained in customUtils, the probability of this ever happening is extremely small, so this is O(1)
  if (this.indexes._id.getMatching(tentativeId).length > 0) {
    tentativeId = this.createNewId();
  }
  return tentativeId;
};

/**
 * Prepare a document (or array of documents) to be inserted in a database
 * @api private
 */
Datastore.prototype.prepareDocumentForInsertion = function (newDoc) {
  var preparedDoc, self = this;

  if (util.isArray(newDoc)) {
    preparedDoc = [];
    newDoc.forEach(function (doc) { preparedDoc.push(self.prepareDocumentForInsertion(doc)); });
  } else {
    if (newDoc._id === undefined) {
      newDoc._id = this.createNewId();
    }
    preparedDoc = document.deepCopy(newDoc);
    document.checkObject(preparedDoc);
  }
  
  return preparedDoc;
};

/**
 * If newDoc is an array of documents, this will insert all documents in the cache
 * @api private
 */
Datastore.prototype._insertInIdx = function (newDoc) {
  if (util.isArray(newDoc)) {
    this._insertMultipleDocsInIdx(newDoc);
  } else {
    this.addToIndexes(this.prepareDocumentForInsertion(newDoc));  
  }
};

/**
 * If one insertion fails (e.g. because of a unique constraint), roll back all previous
 * inserts and throws the error
 * @api private
 */
Datastore.prototype._insertMultipleDocsInIdx = function (newDocs) {
  var i, failingI, error
    , preparedDocs = this.prepareDocumentForInsertion(newDocs)
    ;

  for (i = 0; i < preparedDocs.length; i += 1) {
    try {
      this.addToIndexes(preparedDocs[i]);
    } catch (e) {
      error = e;
      failingI = i;
      break;
    }
  }
  
  if (error) {
    for (i = 0; i < failingI; i += 1) {
      this.removeFromIndexes(preparedDocs[i]);
    }
    
    throw error;
  }
};

/**
 * Count all documents matching the query
 * @param {Object} query MongoDB-style query
 */
Datastore.prototype.count = function(query, callback) {
  var cursor = new Cursor(this, query, function(err, docs, callback) {
    if (err) { return callback(err); }
    return callback(null, docs.length);
  });

  if (typeof callback === 'function') {
    cursor.exec(callback);
  } else {
    return cursor;
  }
};


/**
 * Find all documents matching the query
 * If no callback is passed, we return the cursor so that user can limit, skip and finally exec
 * @param {Object} query MongoDB-style query
 * @param {Object} projection MongoDB-style projection
 */
Datastore.prototype.find = function (query, projection, callback) {
  switch (arguments.length) {
    case 1:
      projection = {};
      // callback is undefined, will return a cursor
      break;
    case 2:
      if (typeof projection === 'function') {
        callback = projection;
        projection = {};
      }   // If not assume projection is an object and callback undefined
      break;
  }

  var cursor = new Cursor(this, query, function(err, docs, callback) {
    var res = [], i;

    if (err) { return callback(err); }

    for (i = 0; i < docs.length; i += 1) {
      res.push(document.deepCopy(docs[i]));
    }
    return callback(null, res);
  });

  cursor.projection(projection);
  if (typeof callback === 'function') {
    cursor.exec(callback);
  } else {
    return cursor;
  }
};


/**
 * Find one document matching the query
 * @param {Object} query MongoDB-style query
 * @param {Object} projection MongoDB-style projection
 */
Datastore.prototype.findOne = function (query, projection, callback) {
  switch (arguments.length) {
    case 1:
      projection = {};
      // callback is undefined, will return a cursor
      break;
    case 2:
      if (typeof projection === 'function') {
        callback = projection;
        projection = {};
      }   // If not assume projection is an object and callback undefined
      break;
  }

  var cursor = new Cursor(this, query, function(err, docs, callback) {
    if (err) { return callback(err); }
    if (docs.length === 1) {
      return callback(null, document.deepCopy(docs[0]));
    } else {
      return callback(null, null);
    }
  });

  cursor.projection(projection).limit(1);
  if (typeof callback === 'function') {
    cursor.exec(callback);
  } else {
    return cursor;
  }
};


/**
 * Update all docs matching query
 * For now, very naive implementation (recalculating the whole database)
 * @param {Object} query
 * @param {Object} updateQuery
 * @param {Object} options Optional options
 *                 options.multi If true, can update multiple documents (defaults to false)
 *                 options.upsert If true, document is inserted if the query doesn't match anything
 * @param {Function} cb Optional callback, signature: err, numReplaced, upsert (set to true if the update was in fact an upsert)
 *
 * @api private Use Datastore.update which has the same signature
 */
Datastore.prototype.update = function (query, updateQuery, options, cb) {
  var callback
    , self = this
    , numReplaced = 0
    , multi, upsert
    , i
    ;

  if (typeof options === 'function') { cb = options; options = {}; }
  callback = cb || function () {};
  multi = options.multi !== undefined ? options.multi : false;
  upsert = options.upsert !== undefined ? options.upsert : false;

  // TODO: this is a huge mess; async shouldn't be used like this, all callbacks should be eventually called
  async.waterfall([
  function (cb) {   // If upsert option is set, check whether we need to insert the doc
    if (!upsert) { return cb(); }

    var cursor = new Cursor(self, query);
    cursor.limit(1).exec(function (err, docs) {
      if (err) { return callback(err); }
      if (docs.length === 1) {
        return cb();
      } else {
        var toBeInserted;
        
        try {
          document.checkObject(updateQuery);
          // updateQuery is a simple object with no modifier, use it as the document to insert
          toBeInserted = updateQuery;
        } catch (e) {
          // updateQuery contains modifiers, use the find query as the base,
          // strip it from all operators and update it according to updateQuery
          toBeInserted = document.modify(document.deepCopy(query, true), updateQuery);
        }

        return self.insert(toBeInserted, function (err, newDoc) {
          if (err) { return callback(err); }
          return callback(null, 1, newDoc);
        });
      }
    });
  }
  , function () {   // Perform the update
    self.getCandidates(query, null, function(candidates) {
      var modifiedDoc
      , modifications = []
      ;

      // Preparing update (if an error is thrown here neither the datafile nor
      // the in-memory indexes are affected)
      try {
        for (i = 0; i < candidates.length; i += 1) {
          if (document.match(candidates[i], query) && (multi || numReplaced === 0)) {
            numReplaced += 1;
            modifiedDoc = document.modify(candidates[i], updateQuery);
            modifications.push({ oldDoc: candidates[i], newDoc: modifiedDoc });
          }
        }
      } catch (err) {
        return callback(err);
      }
    
    // Change the docs in memory
    try {
        self.updateIndexes(modifications);
    } catch (err) {
      return callback(err);
    }

    // Persist in LevelUP
    async.each(_.pluck(modifications, 'newDoc'), function(d, cb) {
      self.store.put(d._id, document.serialize(d), cb);
    }, function(err) {
      callback(err || null, err ? undefined : numReplaced);
    });

    });    
  }
  ]);
};


/**
 * Remove all docs matching the query
 * For now very naive implementation (similar to update)
 * @param {Object} query
 * @param {Object} options Optional options
 *                 options.multi If true, can update multiple documents (defaults to false)
 * @param {Function} cb Optional callback, signature: err, numRemoved
 *
 * @api private Use Datastore.remove which has the same signature
 */
Datastore.prototype.remove = function (query, options, cb) {
  var callback
    , self = this
    , removed = []
    , multi
    ;

  if (typeof options === 'function') { cb = options; options = {}; }
  callback = cb || function () {};
  multi = options.multi !== undefined ? options.multi : false;

  this.getCandidates(query, null, function(candidates) {
    try {
      candidates.forEach(function (d) {
        if (document.match(d, query) && (multi || removed.length === 0)) {
          removed.push(d._id);
          self.removeFromIndexes(d);
        }
      });
    } catch (err) { return callback(err); }

    // Persist in LevelUP
    async.each(removed, function(id, cb) { 
      self.store.del(id, cb);
    }, function(err) {
      callback(err || null, err ? undefined : removed.length);
    });
  });

};



module.exports = Datastore;
