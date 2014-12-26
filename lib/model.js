var customUtils = require('./customUtils')
  , document = require('./document')
  , async = require('async')
  , bagpipe = require('bagpipe')
  , Index = require('./indexes')
  , util = require('util')
  , path = require('path')
  , _ = require('lodash')
  , events = require('events')
  , Cursor = require('./cursor')
  , levelup = require('levelup')
  ;

var stores = {}; // We have to keep those unique by filename because they're locked

var LEVELUP_RETR_CONCURRENCY = 10; // We'll use that on a bagpipe instance regulating findById


/**
 * Create a new model
*/
function Model (name, schema, options) {
  if (typeof(name) != "string") throw "model name not provided";
  if (arguments.length==1) { options = {}; schema = {} };
  if (arguments.length==2) { options = schema; schema = {} };

  var self = function Document(raw) {
    _.extend(this, raw); // Works for now
  };
  _.extend(self, Model.prototype); // Ugly but works - we need to return a function
  var emitter = new events.EventEmitter();
  for (prop in emitter) self[prop] = emitter[prop];


  self.filename = path.normalize(options.filename);
  self.options  = _.extend({ autoIndexing: true }, options);

  // LevelUP ; the safety we have here to re-use instance is right now only because of the tests
  self.store = stores[options.filename];
  self.store = stores[options.filename] = (self.store && self.store.isOpen()) ? self.store : levelup(options.filename, options.store || { });

  // Indexed by field name, dot notation can be used
  // _id is always indexed and since _ids are generated randomly the underlying
  // binary is always well-balanced
  self.indexes = {};
  self.indexes._id = new Index({ fieldName: '_id', unique: true });

  // Concurrency control for 1) index building and 2) pulling objects from LevelUP
  self._pipe = new bagpipe(1);
  self._retrPipe = new bagpipe(LEVELUP_RETR_CONCURRENCY);

  return self;
}


/**
 * Load the database and re-build indexes
 */
Model.prototype.reload = function (cb) {
  this.resetIndexes();
  this._pipe.push(this.buildIndexes.bind(this), function() {
    cb(null);
  });
};

/**
 * Build new indexes from a full scan
 */
Model.prototype.buildIndexes = function (cb) {
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
    self.emit("indexesReady", toBuild);    
    cb(null);
  });
};


/**
 * Get an array of all the data in the database
 */
Model.prototype.getAllData = function () {
  return this.indexes._id.getAll();
};


/**
 * Reset all currently defined indexes
 */
Model.prototype.resetIndexes = function () {
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
Model.prototype.ensureIndex = function (options, cb) {
  var callback = cb || function () {};

  options = options || {};

  if (!options.fieldName) { return callback({ missingFieldName: true }); }
  if (this.indexes[options.fieldName]) { return callback(null); }

  this.indexes[options.fieldName] = new Index(options);

  callback(null);
};


/**
 * Remove an index
 * @param {String} fieldName
 * @param {Function} cb Optional callback, signature: err 
 */
Model.prototype.removeIndex = function (fieldName, cb) {
  var callback = cb || function () {};
  
  delete this.indexes[fieldName];  
  callback(null);
};


/**
 * Add one or several document(s) to all indexes
 */
Model.prototype.addToIndexes = function (doc) {
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
Model.prototype.removeFromIndexes = function (doc) {
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
Model.prototype.updateIndexes = function (oldDoc, newDoc) {
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

 /* TEMPORARY SHIM */
Model.prototype.getCandidates = function (query, sort, cb) {
  var self = this;

  var callback = function(ids) {
    async.map(ids, self.findById.bind(self), function(err, candidates) { cb(candidates) });
  };

  Cursor.getMatchesStream(self, query).on("ids", callback);
};


/**
 * Insert a new document
 * @param {Function} cb Optional callback, signature: err, insertedDoc
 *
 */
Model.prototype.insert = function (newDoc, cb) {
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
Model.prototype.createNewId = function () {
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
Model.prototype.prepareDocumentForInsertion = function (newDoc) {
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
Model.prototype._insertInIdx = function (newDoc) {
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
Model.prototype._insertMultipleDocsInIdx = function (newDocs) {
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


/* 
 * Find a document by ID
 * This function is also used internally after looking up indexes to retrieve docs
 * @param {Object} ID 
 */
Model.prototype.findById = function(id, callback) {
  var self = this;
  this._retrPipe.push(this.store.get.bind(this.store, id), function(err, res) {
    callback(err || null, err ? undefined : new self(document.deserialize(res)));
  });
}

/**
 * Count all documents matching the query
 * @param {Object} query MongoDB-style query
 */
Model.prototype.count = function(query, callback) {
  var cursor = new Cursor(this, query, function(err, docs, callback) {
    if (err) { return callback(err); }
    return callback(null, docs.length);
  });

  if (typeof callback === 'function') cursor.exec(callback);
  return cursor;
};



/**
 * Find all documents matching the query
 * If no callback is passed, we return the cursor so that user can limit, skip and finally exec
 * @param {Object} query MongoDB-style query
 */
Model.prototype.find = function (query, callback) {
  var cursor = new Cursor(this, query, function(err, docs, callback) {
    return callback(err ? err : null, err ? undefined : docs);
  });

  if (typeof callback === 'function') cursor.exec(callback);
  return cursor;
};


/**
 * Find one document matching the query
 * @param {Object} query MongoDB-style query
 */
Model.prototype.findOne = function (query, callback) {
  var cursor = new Cursor(this, query, function(err, docs, callback) {
    if (err) { return callback(err); }
    return callback(null, docs.length ? docs[0] : null);
  });

  if (typeof callback === 'function') cursor.exec(callback);
  return cursor;
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
 * @api private Use Model.update which has the same signature
 */
Model.prototype.update = function (query, updateQuery, options, cb) {
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
 * @api private Use Model.remove which has the same signature
 */
Model.prototype.remove = function (query, options, cb) {
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

    // Persist in LevelUP; do this after error check
    async.each(removed, function(id, cb) { 
      self.store.del(id, cb);
    }, function(err) {
      callback(err || null, err ? undefined : removed.length);
    });
  });

};



module.exports = Model;
