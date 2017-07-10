var should = require('chai').should()
  , assert = require('chai').assert
  , testDb = 'workspace/test1.db'
  , fs = require('fs')
  , path = require('path')
  , _ = require('underscore')
  , async = require('async')
  , rimraf = require('rimraf')
//  , document = require('../lib/document')
  , Model = require('../lib/model')
  , Cursor = require('../lib/cursor')
  ;


describe('Database', function () {
  var d;
  
  function remove_ids(docs){
    docs.forEach(function(d){
      delete d._id;
    });
  }

  beforeEach(function (done) {
    async.waterfall([
       function (cb) {
        if (! d) return cb();
        d.store.close(cb);
       },
       function (cb) {
          rimraf(testDb, cb);
       },
      function (cb) {
        d = new Model("testDb1", { filename: testDb });

        d.filename.should.equal(testDb);

        d.reload(function (err) {
          assert.isNull(err);
          d.getAllData().length.should.equal(0);
          return cb();
        });
      }
    ], function(err) {
      if (err) console.error(err);
      done();
    });
  });

  /*
  describe('Autoloading', function () {
  
    it('Can autoload a database and query it right away', function (done) {
      var fileStr = document.serialize({ _id: '1', a: 5, planet: 'Earth' }) + '\n' + document.serialize({ _id: '2', a: 5, planet: 'Mars' }) + '\n'
        , autoDb = 'workspace/auto.db'
        , db
        ;
      
      fs.writeFileSync(autoDb, fileStr, 'utf8');
      db = new Model({ filename: autoDb, autoload: true })
      
      db.find({}, function (err, docs) {
        assert.isNull(err);
        docs.length.should.equal(2);
        done();
      });
    });
    
    it('Throws if autoload fails', function (done) {
      var fileStr = document.serialize({ _id: '1', a: 5, planet: 'Earth' }) + '\n' + document.serialize({ _id: '2', a: 5, planet: 'Mars' }) + '\n' + '{"$$indexCreated":{"fieldName":"a","unique":true}}'
        , autoDb = 'workspace/auto.db'
        , db
        ;
      
      fs.writeFileSync(autoDb, fileStr, 'utf8');
      
      // Check the reload generated an error
      function onload (err) {
        err.errorType.should.equal('uniqueViolated');
        done();
      }
      
      db = new Model({ filename: autoDb, autoload: true, onload: onload })
      
      db.find({}, function (err, docs) {
        done("Find should not be executed since autoload failed");
      });    
    });
 
  });
  */
  describe('Insert', function () {

    it('Able to insert a document in the database, setting an _id if none provided, and retrieve it even after a reload', function (done) {
      d.find({}, function (err, docs) {
        docs.length.should.equal(0);

        d.insert({ somedata: 'ok' }, function (err) {
          // The data was correctly updated
          d.find({}, function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(1);
            Object.keys(docs[0]).length.should.equal(2);
            docs[0].somedata.should.equal('ok');
            assert.isDefined(docs[0]._id);
            docs[0]._id.should.have.lengthOf(16);

            // After a reload the data has been correctly persisted
            d.reload(function (err) {
              d.find({}, function (err, docs) {
                assert.isNull(err);
                docs.length.should.equal(1);
                Object.keys(docs[0]).length.should.equal(2);
                docs[0].somedata.should.equal('ok');
                assert.isDefined(docs[0]._id);
                docs[0]._id.should.have.lengthOf(16);

                done();
              });
            });
          });
        });
      });
    });


    it('Can insert multiple documents in the database', function (done) {
      d.find({}, function (err, docs) {
        docs.length.should.equal(0);

        d.insert({ somedata: 'ok' }, function (err) {
          d.insert({ somedata: 'another' }, function (err) {
            d.insert({ somedata: 'again' }, function (err) {
              d.find({}, function (err, docs) {
                docs.length.should.equal(3);
                _.pluck(docs, 'somedata').should.contain('ok');
                _.pluck(docs, 'somedata').should.contain('another');
                _.pluck(docs, 'somedata').should.contain('again');
                done();
              });
            });
          });
        });
      });
    });

    it('Can insert and get back from DB complex objects with all primitive and secondary types', function (done) {
      var da = new Date()
        , obj = { a: ['ee', 'ff', 42], date: da, subobj: { a: 'b', b: 'c' } }
        ;

      d.insert(obj, function (err) {
        d.findOne({}, function (err, res) {
          assert.isNull(err);
          res.a.length.should.equal(3);
          res.a[0].should.equal('ee');
          res.a[1].should.equal('ff');
          res.a[2].should.equal(42);
          res.date.getTime().should.equal(da.getTime());
          res.subobj.a.should.equal('b');
          res.subobj.b.should.equal('c');

          done();
        });
      });
    });

    it('If an object returned from the DB is modified and refetched, the original value should be found', function (done) {
      d.insert({ a: 'something' }, function () {
        d.findOne({}, function (err, doc) {
          doc.a.should.equal('something');
          doc.a = 'another thing';
          doc.a.should.equal('another thing');

          // Re-fetching with findOne should yield the persisted value
          d.findOne({}, function (err, doc) {
            doc.a.should.equal('something');
            doc.a = 'another thing';
            doc.a.should.equal('another thing');

            // Re-fetching with find should yield the persisted value
            d.find({}, function (err, docs) {
              docs[0].a.should.equal('something');

              done();
            });
          });
        });
      });
    });

    it('Cannot insert a doc that has a field beginning with a $ sign', function (done) {
      d.insert({ $something: 'atest' }, function (err) {
        assert.isDefined(err);
        done();
      });
    });

    it('If an _id is already given when we insert a document, use that instead of generating a random one', function (done) {
      d.insert({ _id: 'test', stuff: true }, function (err, newDoc) {
        if (err) { return done(err); }

        newDoc.stuff.should.equal(true);
        newDoc._id.should.equal('test');

        d.insert({ _id: 'test', otherstuff: 42 }, function (err) {
          err.errorType.should.equal('uniqueViolated');
        
          done();
        });
      });
    });

    it('Modifying the insertedDoc after an insert doesnt change the copy saved in the database', function (done) {
      d.insert({ a: 2, hello: 'world' }, function (err, newDoc) {
        newDoc.hello = 'changed';

        d.findOne({ a: 2 }, function (err, doc) {
          doc.hello.should.equal('world');
          done();
        });
      });
    });
    
    it('Can insert an array of documents at once', function (done) {
      var docs = [{ a: 5, b: 'hello' }, { a: 42, b: 'world' }];
    
      d.insert(docs, function (err) {
        d.find({}, function (err, docs) {
          var data;
        
          docs.length.should.equal(2);
          _.find(docs, function (doc) { return doc.a === 5; }).b.should.equal('hello');
          _.find(docs, function (doc) { return doc.a === 42; }).b.should.equal('world');
          
          // The data has been persisted correctly
          /*
          data = _.filter(fs.readFileSync(testDb, 'utf8').split('\n'), function (line) { return line.length > 0; });
          data.length.should.equal(2);
          document.deserialize(data[0]).a.should.equal(5);
          document.deserialize(data[0]).b.should.equal('hello');
          document.deserialize(data[1]).a.should.equal(42);
          document.deserialize(data[1]).b.should.equal('world');
          */

          done();
        });
      });
    });
    
    it('If a bulk insert violates a constraint, all changes are rolled back', function (done) {
      var docs = [{ a: 5, b: 'hello' }, { a: 42, b: 'world' }, { a: 5, b: 'bloup' }, { a: 7 }];
    
      d.ensureIndex({ fieldName: 'a', unique: true });
    
      d.insert(docs, function (err) {
        err.errorType.should.equal('uniqueViolated');
      
        d.find({}, function (err, docs) {
          // Datafile only contains index definition
          //var datafileContents = document.deserialize(fs.readFileSync(testDb, 'utf8'));
          //assert.deepEqual(datafileContents, { $$indexCreated: { fieldName: 'a', unique: true } });
          docs.length.should.equal(0);

          done();
        });
      });
    });

    it('Can insert a doc with id 0', function (done) {
      d.insert({ _id: 0, hello: 'world' }, function (err, doc) {
        doc._id.should.equal(0);
        doc.hello.should.equal('world');
        done();
      });
    });
    
    /**
     * Complicated behavior here. Basically we need to test that when a user function throws an exception, it is not caught
     * in NeDB and the callback called again, transforming a user error into a NeDB error.
     *
     * So we need a way to check that the callback is called only once and the exception thrown is indeed the client exception
     * Mocha's exception handling mechanism interferes with this since it already registers a listener on uncaughtException
     * which we need to use since findOne is not called in the same turn of the event loop (so no try/catch)
     * So we remove all current listeners, put our own which when called will register the former listeners (incl. Mocha's) again.
     *
     * Note: maybe using an in-memory only NeDB would give us an easier solution
     */
    it('If the callback throws an uncaught execption, dont catch it inside findOne, this is userspace concern', function (done) {
      var tryCount = 0
        , currentUncaughtExceptionHandlers = process.listeners('uncaughtException')
        , i
        ;

      process.removeAllListeners('uncaughtException');
      
      process.on('uncaughtException', function MINE (ex) {
        for (i = 0; i < currentUncaughtExceptionHandlers.length; i += 1) {
          process.on('uncaughtException', currentUncaughtExceptionHandlers[i]);
        }
      
        ex.should.equal('SOME EXCEPTION');
        process.removeListener('uncaughtException', MINE);

        done();
      });

      d.insert({ a: 5 }, function () {
        d.findOne({ a : 5}, function (err, doc) {            
          if (tryCount === 0) {
            tryCount += 1;
            throw 'SOME EXCEPTION';
          } else {
            done('Callback was called twice');
          }
        });
      });      
    });

    it('If the callback throws an uncaught execption, dont catch it inside update, this is userspace concern', function (done) {
      var tryCount = 0
        , currentUncaughtExceptionHandlers = process.listeners('uncaughtException')
        , i
        ;

      process.removeAllListeners('uncaughtException');
      
      process.on('uncaughtException', function MINE (ex) {
        for (i = 0; i < currentUncaughtExceptionHandlers.length; i += 1) {
          process.on('uncaughtException', currentUncaughtExceptionHandlers[i]);
        }
      
        ex.should.equal('SOME EXCEPTION');
        process.removeListener('uncaughtException', MINE);        
        done();
      });

      d.insert({ a: 5 }, function () {
        d.update({ a : 5}, { a: 6 }, function (err, count) {            
          if (tryCount === 0) {
            tryCount += 1;
            throw 'SOME EXCEPTION';
          } else {
            done('Callback was called twice');
          }
        });
      });      
    });


    it('Use .save for inserting a document, then updating', function (done) {
      d.find({}, function (err, docs) {
        docs.length.should.equal(0);

        d.save({ a: 5 }, function(err, doc) {
          assert.isNull(err);
          assert.isDefined(doc._id);

          d.findOne({ _id: doc._id }, function(err, doc1) {

            assert.isNull(err);
            assert.isDefined(doc1._id);
            doc1._id.should.equal(doc._id);

            d.save({ _id: doc1._id, a: 6 }, function(err, doc2) {
              assert.isNull(err);
              assert.isDefined(doc2._id);
              doc2._id.should.equal(doc._id);
              doc2.a.should.equal(6);
              done();
            });
          });
        });
      });
    });

    it('Use .save for bulk inserting documents, updating some', function (done) {
      d.find({}, function (err, docs) {
        docs.length.should.equal(0);

        d.save([{ a: 5 }, { a: 10 }, { a: 12 }], function(err, docs) {
          assert.isNull(err);
          docs.length.should.equal(3);

          d.findOne({ _id: docs[0]._id }, function(err, doc1) {
            assert.isNull(err);
            doc1.a.should.equal(5);
            
            doc1.b = 15;
            d.save([doc1,{ a: 15 }], function(err, docs) {
              assert.isNull(err);
              docs.length.should.equal(2);

              d.findOne({ _id: docs[0]._id }, function(err,doc2) {
                doc2.a.should.equal(5);
                doc2.b.should.equal(15);

                d.find({}, function(err,docs) {
                  assert.isNull(err);
                  docs.length.should.equal(4);
                  done();
                });
              });
            });

          });
        });

      });
    });
    
    describe('Events', function () {
      describe('construct', function () {
        it('Emits the construct event when a doc is constructed', function (done) {
          var constructed = false;
          d.on('construct', function (doc) {
            doc.a.should.equal(1);
            constructed = true;
          });
          d.insert({ a: 1 }, function (err, doc) {
            if (err) throw err;
            assert.isTrue(constructed, "doc was constructed");
            done();
          });
        });
      });

      describe('when a document is inserted', function () {
        it('Emits the inserted event with the inserted doc', function (done) {
          var inserted = false;
          d.on('inserted', function (docs) {
            remove_ids(docs);
            docs.should.eql([{ a: 1 }]); 
            inserted = true;    
          });
          d.insert({ a: 1 }, function (err, doc) {
            if (err) throw err;
            assert.isTrue(inserted, "doc was inserted");
            done();
          });
        });
      });

      describe('when multiple documents are inserted', function () {
        it('Emits the inserted event with the inserted docs', function (done) {
          var inserted = false;
          d.on('inserted', function (docs) {
            remove_ids(docs);
            _.sortBy(docs, 'a').should.eql([{ a: 1 }, { a: 2 }]);
            inserted = true;
          });
          d.insert([{ a: 1 }, { a: 2}], function (err, doc) {
            if (err) throw err;
            assert.isTrue(inserted);
            done();
          });
        });
      });

      describe('when the insert fails', function () {
        it('The inserted event is not emitted', function (done) {          
          d.ensureIndex({ fieldName: 'a', unique: true }, function (err) {
            if (err) throw err;
          });
          d.insert({ a: 1 }, function (err, doc) {
            if (err) throw err;
            d.on('inserted', function (docs) {
              throw new Error('Inserted emitted');
            });
            d.insert({ a: 1 }, function (err, doc) {
              setTimeout(done, 100);
            });
          });
        });
      });

    });
  });   // ==== End of 'Insert' ==== //


  describe('#getIdsForQuery', function () {
    var getCandidates = function(query, sort, cb) {
      cb = _.once(cb)
      var stream = Cursor.getMatchesStream(d, query, sort);
      stream.on("ids", function(ids) {
        stream.close();
        async.map(ids, d.findById.bind(d), function(err, candidates) { cb(candidates) });
      });
    };

    it('Auto-indexing works', function (done) {
      d.options.autoIndexing.should.equal(true);

      d.insert({ tf: 4, r: 6 }, function (err, _doc1) {
        getCandidates({ r: 6, tf: 4 }, null, function(data) {
          assert.isDefined(d.indexes.tf);
          assert.isDefined(d.indexes.r);
          done();
        });
      });
    });


    it('Auto-indexing is debounced', function (done) {
      d.options.autoIndexing.should.equal(true);

      d.insert({ tf: 4, r: 6 }, function (err, _doc1) {
        getCandidates({ r: 6 }, null, function(data) { });
        setTimeout(function() { getCandidates({ tf: 4 }, null, function(data) { }) }, 5);

        d.once("indexesReady", function(indexes) {
          indexes.length.should.equal(2);

          assert.isNotNull(_.find(indexes, function(x) { return x.fieldName === "r" }));          
          assert.isNotNull(_.find(indexes, function(x) { return x.fieldName === "tf" }));

          done();
        });
      });
    });


    it('Auto-indexing can be disabled', function (done) {
      d.options.autoIndexing.should.equal(true);
      d.options.autoIndexing = false;

      d.insert({ tf: 4, r: 6 }, function (err, _doc1) {
        getCandidates({ r: 6, tf: 4 }, null, function(data) {
          assert.isUndefined(d.indexes.tf);
          assert.isUndefined(d.indexes.r);
          done();
        });
      });
    });


    it('Can use a compound index to get docs with a basic match', function (done) {
      return done(new Error("not implemented - TODO"));

      d.options.autoIndexing = false;
      d.ensureIndex({ fieldName: ['tf', 'tg'] }, function (err) {
        d.insert({ tf: 4, tg: 0, foo: 1 }, function () {
          d.insert({ tf: 6, tg: 0, foo: 2 }, function () {
            d.insert({ tf: 4, tg: 1, foo: 3 }, function (err, _doc1) {
              d.insert({ tf: 6, tg: 1, foo: 4 }, function () {
                getCandidates({ tf: 4, tg: 1 }, null, function(data) {
                  var doc1 = _.find(data, function (d) { return d._id === _doc1._id; })
                    ;

                  data.length.should.equal(1);
                  assert.deepEqual(doc1, { _id: doc1._id, tf: 4, tg: 1, foo: 3 });

                  done();
                })
              });
            });
          });
        });
      });
    });

    it('Can use an index to get docs with a basic match on two indexes', function (done) {
      d.options.autoIndexing.should.equal(true);

      d.insert({ tf: 4, r: 6 }, function (err, _doc1) {
        d.insert([{ tf: 6 }, { tf: 4, an: 'dont match us' } ], function () {
          d.insert({ tf: 4, an: 'other', r: 6 }, function (err, _doc2) {
            d.insert({ tf: 9 }, function () {
              getCandidates({ r: 6, tf: 4 }, null, function(data) {
                var doc1 = _.find(data, function (d) { return d._id === _doc1._id; })
                  , doc2 = _.find(data, function (d) { return d._id === _doc2._id; })
                  ;

                data.length.should.equal(2);
                assert.deepEqual(doc1, { _id: doc1._id, tf: 4, r: 6 });
                assert.deepEqual(doc2, { _id: doc2._id, tf: 4, an: 'other', r: 6 });

                done();
              });

            });
          });
        });
      });
    });


    it('Can use an index to get docs with $exists', function (done) {
      d.insert([
        { tf: 4, r: 6 },
        { tf: 4, r: 9 },
        { tf: 10, r: 2 },
        { tf: 3 },
      ], function (err) {
        getCandidates({ r: { $exists: true } }, null, function(data) {
            data.length.should.equal(3);
            getCandidates({ r: { $exists: false } }, null, function(data) {
                data.length.should.equal(1);
                done();
            });
        });
      });
    });


    it('Can use an index to get docs with multiple operators ($lt and $exists)', function (done) {
      var doc;
      d.insert([
        { tf: 4, r: 2 },
        { tf: 3 },
        { tf: 5, r: 6 },        
        { tf: 10, r: 10 },
      ], function (err, docs) {
        doc = docs[0];
        getCandidates({ r: { $exists: true, $lt: 5 } }, null, function(data) {
            data.length.should.equal(1);
            assert.deepEqual(doc, data[0]);
            done();
        });
      });
    });


    it('Can use an index to get docs with $regex', function (done) {
      var doc1, doc2;
      d.insert([
          doc1 = { name: "Jim" },
          doc2 = { name: "Jan" },
          { name: "Dwight" },
          { name: "Oscar "},
          { somethingElse: "else" }
      ], function (err, docs) {

        getCandidates({ name: { $regex: /^J/ } }, null, function(data) {
            data.length.should.equal(2);
            data.sort(function(b,a){ return a.name > b.name });

            doc1.name.should.equal(data[0].name);
            doc2.name.should.equal(data[1].name);

            done();
        });
      });
    });


    it('Can use an index to get docs with a basic match on two indexes, with $ne', function (done) {
      d.options.autoIndexing.should.equal(true);

      d.insert({ tf: 4, r: 6 }, function (err, _doc1) {
        d.insert({ tf: 5, r: 6 }, function () {
          d.insert({ tf: 4, an: 'other', r: 6 }, function (err, _doc2) {
            d.insert({ tf: 9 }, function () {
              getCandidates({ tf: { $ne: 5 }, r: 6 }, null, function(data) {
                var doc1 = _.find(data, function (d) { return d._id === _doc1._id; })
                  , doc2 = _.find(data, function (d) { return d._id === _doc2._id; })
                  ;

                data.length.should.equal(2);
                assert.deepEqual(doc1, { _id: doc1._id, tf: 4, r: 6 });
                assert.deepEqual(doc2, { _id: doc2._id, tf: 4, an: 'other', r: 6 });

                done();
              });

            });
          });
        });
      });
    });

    it('Can use an index to get docs with a basic match on two indexes, with dot value', function (done) {
      d.options.autoIndexing.should.equal(true);

      d.insert({ tf: 4, r: { a: 6 } }, function (err, _doc1) {
        d.insert({ tf: 6 }, function () {
          d.insert({ tf: 4, an: 'other', r: { a: 4 } }, function (err) {
            d.insert({ tf: 9 }, function () {
              getCandidates({ "r.a": 6 , tf: 4 }, null, function(data) {
                var doc1 = _.find(data, function (d) { return d._id === _doc1._id; })
                  ;

                data.length.should.equal(1);
                assert.deepEqual(doc1, { _id: doc1._id, tf: 4, r: { a: 6 } });

                done();
              });

            });
          });
        });
      });
    });

    it('Can use an index to get docs with a $in match', function (done) {
      d.ensureIndex({ fieldName: 'tf' }, function (err) {
        d.insert({ tf: 4 }, function (err) {
          d.insert({ tf: 6 }, function (err, _doc1) {
            d.insert({ tf: 4, an: 'other' }, function (err) {
              d.insert({ tf: 9 }, function (err, _doc2) {
                getCandidates({ tf: { $in: [6, 9, 5] } },null,function(data) {
                  var doc1 = _.find(data, function (d) { return d._id === _doc1._id; })
                    , doc2 = _.find(data, function (d) { return d._id === _doc2._id; })
                    ;

                  data.length.should.equal(2);
                  assert.deepEqual(doc1, { _id: doc1._id, tf: 6 });
                  assert.deepEqual(doc2, { _id: doc2._id, tf: 9 });

                  done();
                })

              });
            });
          });
        });
      });
    });

    it('Can use an index to get docs with a $nin match', function (done) {
      d.ensureIndex({ fieldName: 'tf' }, function (err) {
        d.insert({ tf: 4 }, function (err) {
          d.insert({ tf: 6 }, function (err, _doc1) {
            d.insert({ tf: 4, an: 'other' }, function (err) {
              d.insert({ tf: 9 }, function (err, _doc2) {
                getCandidates({ tf: { $nin: [4, 8, 10] } },null,function(data) {
                  var doc1 = _.find(data, function (d) { return d._id === _doc1._id; })
                    , doc2 = _.find(data, function (d) { return d._id === _doc2._id; })
                    ;

                  data.length.should.equal(2);
                  assert.deepEqual(doc1, { _id: doc1._id, tf: 6 });
                  assert.deepEqual(doc2, { _id: doc2._id, tf: 9 });

                  done();
                })

              });
            });
          });
        });
      });
    });

    it('Can use indexes for comparison matches', function (done) {
      d.ensureIndex({ fieldName: 'tf' }, function (err) {
        d.insert({ tf: 4 }, function (err, _doc1) {
          d.insert({ tf: [4,6,8] }, function (err, _doc2) { // matched, test with array
            d.insert({ tf: 4, an: 'other' }, function (err, _doc3) {
              d.insert({ tf: 9 }, function (err, _doc4) { // matched
                getCandidates({  tf: { $lte: 9, $gte: 6 } }, null, function(data) {
                  var doc2 = _.find(data, function (d) { return d._id === _doc2._id; })
                    , doc4 = _.find(data, function (d) { return d._id === _doc4._id; })
                    ;

                  data.length.should.equal(2);
                  assert.deepEqual(doc2, { _id: doc2._id, tf: [4,6,8] });
                  assert.deepEqual(doc4, { _id: doc4._id, tf: 9 });

                  done();
                })

              });
            });
          });
        });
      });
    });

    it('Can use an index to get docs with logical operator $or', function (done) {
      d.ensureIndex({ fieldName: 'tf' }, function (err) {
        d.insert({ tf: 4 }, function (err) {
          d.insert({ tf: 6 }, function (err, _doc1) {
            d.insert({ tf: 4, an: 'other' }, function (err) {
              d.insert({ tf: 9 }, function (err, _doc2) {
                getCandidates({ $or: [ { tf: 6 }, { tf: 9 } ] },null,function(data) {
                  var doc1 = _.find(data, function (d) { return d._id === _doc1._id; })
                    , doc2 = _.find(data, function (d) { return d._id === _doc2._id; })
                    ;

                  data.length.should.equal(2);
                  assert.deepEqual(doc1, { _id: doc1._id, tf: 6 });
                  assert.deepEqual(doc2, { _id: doc2._id, tf: 9 });

                  done();
                })

              });
            });
          });
        });
      });
    });


    it('Can use an index to get docs with logical operator $and', function (done) {
      d.ensureIndex({ fieldName: 'tf' }, function (err) {
        d.insert({ tf: 4 }, function (err) {
          d.insert({ tf: 6 }, function (err) {
            d.insert({ tf: 4, an: 'other' }, function (err, _doc1) {
              d.insert({ tf: 9 }, function (err) {
                getCandidates({ $and: [ { tf: 4 }, { an: 'other' } ] },null,function(data) {
                  var doc1 = _.find(data, function (d) { return d._id === _doc1._id; })
                    ;

                  data.length.should.equal(1);
                  assert.deepEqual(doc1, { _id: doc1._id, tf: 4, an: 'other' });

                  done();
                })

              });
            });
          });
        });
      });
    });


    it('Can use an index to get docs with logical operator $not, with nesting operators', function (done) {
      d.ensureIndex({ fieldName: 'tf' }, function (err) {
        d.insert({ tf: 6 }, function (err, _doc1) {
          d.insert({ tf: 4, an: 'other' }, function (err) {
            d.insert({ tf: 9 }, function (err, _doc2) {
              getCandidates({ $not: { $and: [ { tf: 4 }, { an: 'other' } ] } },null,function(data) {
                  var doc1 = _.find(data, function (d) { return d._id === _doc1._id; })
                    , doc2 = _.find(data, function (d) { return d._id === _doc2._id; })
                    ;

                  data.length.should.equal(2);
                  assert.deepEqual(doc1, { _id: doc1._id, tf: 6 });
                  assert.deepEqual(doc2, { _id: doc2._id, tf: 9 });

                  done();
              })

            });
          });
        });
      });
    });

    it('Can use an index to get sorted docs', function (done) {
      d.insert([
        { a: 12, b: 1 },
        { a: 1, b: 3 },
        { a: 5, b: 3 },
        { a: 3, b: 2 },
        { a: 14, b: 2 },
        { a: 18, b: 2 },
        { a: 9, b: 1 },
        { b: 2 } // to check if we still match on a (a: { $exists: true } )
      ], function() { 
        getCandidates({ }, { a: 1 }, function(data) {
          data.length.should.equal(8);
          assert.deepEqual(_.pluck(data, "a"), [ undefined, 1, 3, 5, 9, 12, 14, 18 ]);
          done();
        });
      })
    });

    it('Can use an index to get sorted docs with query', function (done) {
      d.insert([
        { a: 12, b: 1 },
        { a: 1, b: 3 },
        { a: 5, b: 3 },
        { a: 3, b: 2 },
        { a: 14, b: 2 },
        { a: 18, b: 2 },
        { a: 9, b: 1 },
        { b: 2 } // to check if we still match on a (a: { $exists: true } )
      ], function() { 
        getCandidates({ b: { $gt: 1 }, a: { $exists: true } }, { a: 1 }, function(data) {
          data.length.should.equal(5);
          assert.deepEqual(_.pluck(data, "a"), [ 1,3,5,14,18 ]);
          done();
        });
      })
    });


    it('Can use an index to get sorted docs via compound sort', function (done) {
      return done(new Error("not implemented - TODO"));

      d.options.autoIndexing.should.equal(true);

      d.insert([
        { a: 1, b: 3 },
        { a: 12, b: 1 },
        { a: 5, b: 3 },
        { a: 3, b: 2 },
        { a: 18, b: 2 },
        { a: 14, b: 2 },
        { a: 9, b: 1 },
        { b: 2 } // to check if we still match on a (a: { $exists: true } )
      ], function() { 
        getCandidates({ a: { $gt: 1 } }, { b: 1, a: 1 }, function(data) {
          data.length.should.equal(6);
          assert.deepEqual(_.pluck(data, "b"), [ 1,1,2,2,2,3 ]);
          assert.deepEqual(_.pluck(data, "a"), [ 9,12,  3,14,8,  3 ]);
          done();
        });
      })
    });


    it('Query sets _sorted/_indexed flag if completely sorted and indexed', function (done) {
      d.insert([
        { a: 12, b: 1 },
        { a: 1, b: 3 },
        { a: 5, b: 3 },
        { a: 3, b: 2 },
        { a: 14, b: 2 },
        { a: 18, b: 2 },
        { a: 9, b: 1 },
        { b: 2 } // to check if we still match on a (a: { $exists: true } )
      ], function() { 
        var stream = Cursor.getMatchesStream(d, { b: { $gt: 1 }, a: { $exists: true } }, { a: 1 });
        stream.on("ids", function(ids) {
          ids._sorted.should.equal(true);
          ids._indexed.should.equal(true);

          done();
        })
      });
    });

    it('Query sets _sorted/_indexed flag if not completely sorted and indexed', function (done) {
      d.options.autoIndexing = false;

      d.insert([
        { a: 12, b: 1 },
        { a: 1, b: 3 },
        { a: 5, b: 3 },
        { a: 3, b: 2 },
        { a: 14, b: 2 },
        { a: 18, b: 2 },
        { a: 9, b: 1 },
        { b: 2 } // to check if we still match on a (a: { $exists: true } )
      ], function() {
        var stream = Cursor.getMatchesStream(d, { b: { $gt: 1 }, a: { $exists: true } }, { a: 1 });
        stream.on("ids", function(ids) {
          ids._sorted.should.equal(false);
          ids._indexed.should.equal(false);

          done();
        })
      });
    });

  });   // ==== End of '#getIdsForQuery' ==== //


  describe('Find', function () {
    it('Can find document by ID', function (done) {
      async.waterfall([
      function (cb) {
        d.insert({ somedata: 'ok' }, function (err, doc) {
          cb(err, doc)
        });
      }
      , function (doc, cb) {   // Test with query that will return docs
        d.findById(doc._id, function(err, res) {
          assert.isNull(err);
          assert.deepEqual(res, doc);

          cb();
        });
      }
      ], done);
    });

    it('Can find all documents if an empty query is used', function (done) {
      async.waterfall([
      function (cb) {
        d.insert({ somedata: 'ok' }, function (err) {
          d.insert({ somedata: 'another', plus: 'additional data' }, function (err) {
            d.insert({ somedata: 'again' }, function (err) { return cb(err); });
          });
        });
      }
      , function (cb) {   // Test with empty object
        d.find({}, function (err, docs) {
          assert.isNull(err);
          docs.length.should.equal(3);
          _.pluck(docs, 'somedata').should.contain('ok');
          _.pluck(docs, 'somedata').should.contain('another');
          _.find(docs, function (d) { return d.somedata === 'another' }).plus.should.equal('additional data');
          _.pluck(docs, 'somedata').should.contain('again');
          return cb();
        });
      }
      ], done);
    });

    it('Can find all documents matching a basic query', function (done) {
      async.waterfall([
      function (cb) {
        d.insert({ somedata: 'ok' }, function (err) {
          d.insert({ somedata: 'again', plus: 'additional data' }, function (err) {
            d.insert({ somedata: 'again' }, function (err) { return cb(err); });
          });
        });
      }
      , function (cb) {   // Test with query that will return docs
        d.find({ somedata: 'again' }, function (err, docs) {
          assert.isNull(err);
          docs.length.should.equal(2);
          _.pluck(docs, 'somedata').should.not.contain('ok');
          return cb();
        });
      }
      , function (cb) {   // Test with query that doesn't match anything
        d.find({ somedata: 'nope' }, function (err, docs) {
          assert.isNull(err);
          docs.length.should.equal(0);
          return cb();
        });
      }
      ], done);
    });


    it('Can find one document matching a basic query and return null if none is found', function (done) {
      async.waterfall([
      function (cb) {
        d.insert({ somedata: 'ok' }, function (err) {
          d.insert({ somedata: 'again', plus: 'additional data' }, function (err) {
            d.insert({ somedata: 'again' }, function (err) { return cb(err); });
          });
        });
      }
      , function (cb) {   // Test with query that will return docs
        d.findOne({ somedata: 'ok' }, function (err, doc) {
          assert.isNull(err);
          Object.keys(doc).length.should.equal(2);
          doc.somedata.should.equal('ok');
          assert.isDefined(doc._id);
          return cb();
        });
      }
      , function (cb) {   // Test with query that doesn't match anything
        d.findOne({ somedata: 'nope' }, function (err, doc) {
          assert.isNull(err);
          assert.isNull(doc);
          return cb();
        });
      }
      ], done);
    });

    it('Can find dates and objects (non JS-native types)', function (done) {
      var date1 = new Date(1234543)
        , date2 = new Date(9999)
        ;

      d.insert({ now: date1, sth: { name: 'nedb' } }, function () {
        d.findOne({ now: date1 }, function (err, doc) {
          assert.isNull(err);
          assert.isNotNull(doc);

          doc.sth.name.should.equal('nedb');

          d.findOne({ now: date2 }, function (err, doc) {
            assert.isNull(err);
            assert.isNull(doc);

            d.findOne({ sth: { name: 'nedb' } }, function (err, doc) {
              assert.isNull(err);
              doc.sth.name.should.equal('nedb');

              d.findOne({ sth: { name: 'other' } }, function (err, doc) {
                assert.isNull(err);
                assert.isNull(doc);

                done();
              });
            });
          });
        });
      });
    });

    it('Can use dot-notation to query subfields', function (done) {
      d.insert({ greeting: { english: 'hello' } }, function () {
        d.findOne({ "greeting.english": 'hello' }, function (err, doc) {
          assert.isNull(err);
          doc.greeting.english.should.equal('hello');

          d.findOne({ "greeting.english": 'hellooo' }, function (err, doc) {
            assert.isNull(err);
            assert.isNull(doc);

            d.findOne({ "greeting.englis": 'hello' }, function (err, doc) {
              assert.isNull(err);
              assert.isNull(doc);

              done();
            });
          });
        });
      });
    });

    it('Array fields match if any element matches', function (done) {
      d.insert({ fruits: ['pear', 'apple', 'banana'] }, function (err, doc1) {
        d.insert({ fruits: ['coconut', 'orange', 'pear'] }, function (err, doc2) {
          d.insert({ fruits: ['banana'] }, function (err, doc3) {
            d.find({ fruits: 'pear' }, function (err, docs) {
              assert.isNull(err);
              docs.length.should.equal(2);
              _.pluck(docs, '_id').should.contain(doc1._id);
              _.pluck(docs, '_id').should.contain(doc2._id);

              d.find({ fruits: 'banana' }, function (err, docs) {
                assert.isNull(err);
                docs.length.should.equal(2);
                _.pluck(docs, '_id').should.contain(doc1._id);
                _.pluck(docs, '_id').should.contain(doc3._id);

                d.find({ fruits: 'doesntexist' }, function (err, docs) {
                  assert.isNull(err);
                  docs.length.should.equal(0);

                  done();
                });
              });
            });
          });
        });
      });
    });

    it('Returns an error if the query is not well formed', function (done) {
      d.insert({ hello: 'world' }, function () {
        d.find({ $or: { hello: 'world' } }, function (err, docs) {
          assert.isDefined(err);
          assert.isUndefined(docs);

          d.findOne({ $or: { hello: 'world' } }, function (err, doc) {
            assert.isDefined(err);
            assert.isUndefined(doc);

            done();
          });
        });
      });
    });

    it('Changing the documents returned by find or findOne do not change the database state', function (done) {
      d.insert({ a: 2, hello: 'world' }, function () {
        d.findOne({ a: 2 }, function (err, doc) {
          doc.hello = 'changed';

          d.findOne({ a: 2 }, function (err, doc) {
            doc.hello.should.equal('world');

            d.find({ a: 2 }, function (err, docs) {
              docs[0].hello = 'changed';

              d.findOne({ a: 2 }, function (err, doc) {
                doc.hello.should.equal('world');

                done();
              });
            });
          });
        });
      });
    });
    
    it('Can use sort, skip and limit if the callback is not passed to find but to exec', function (done) {
      d.insert({ a: 2, hello: 'world' }, function () {
        d.insert({ a: 24, hello: 'earth' }, function () {
          d.insert({ a: 13, hello: 'blueplanet' }, function () {
            d.insert({ a: 15, hello: 'home' }, function () {
              d.find({}).sort({ a: 1 }).limit(2).exec(function (err, docs) {
                assert.isNull(err);
                docs.length.should.equal(2);
                docs[0].hello.should.equal('world');
                docs[1].hello.should.equal('blueplanet');
                done();
              });
            });
          });
        });      
      });
    });

     it('Can use sort and skip if the callback is not passed to findOne but to exec', function (done) {
      d.insert({ a: 2, hello: 'world' }, function () {
        d.insert({ a: 24, hello: 'earth' }, function () {
          d.insert({ a: 13, hello: 'blueplanet' }, function () {
            d.insert({ a: 15, hello: 'home' }, function () {
              // No skip no query
              d.findOne({}).sort({ a: 1 }).exec(function (err, doc) {
                assert.isNull(err);
                doc.hello.should.equal('world');
                
                // A query
                d.findOne({ a: { $gt: 14 } }).sort({ a: 1 }).exec(function (err, doc) {
                  assert.isNull(err);
                  doc.hello.should.equal('home');

                  // And a skip
                  d.findOne({ a: { $gt: 14 } }).sort({ a: 1 }).skip(1).exec(function (err, doc) {
                    assert.isNull(err);
                    doc.hello.should.equal('earth');

                    // No result
                    d.findOne({ a: { $gt: 14 } }).sort({ a: 1 }).skip(2).exec(function (err, doc) {
                      assert.isNull(err);
                      assert.isNull(doc);

                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });


    describe('Events', function() {
      it('before query, allows to modify query', function (done) {
        d.insert([{ tf: 4, r: 6 }, { tf: 5, r: 8 }], function (err) {
          d.on('query', function(q) { q.tf=4 });
          d.find({ r: { $gt: 5 } }, function(err, docs) {
            docs.length.should.equal(1);
            done();
          })
        });
      });
    });
    
  });   // ==== End of 'Find' ==== //

  describe('Count', function() {

    it('Count all documents if an empty query is used', function (done) {
      async.waterfall([
      function (cb) {
        d.insert({ somedata: 'ok' }, function (err) {
          d.insert({ somedata: 'another', plus: 'additional data' }, function (err) {
            d.insert({ somedata: 'again' }, function (err) { return cb(err); });
          });
        });
      }
      , function (cb) {   // Test with empty object
        d.count({}, function (err, docs) {
          assert.isNull(err);
          docs.should.equal(3);
          return cb();
        });
      }
      ], done);
    });

    it('Count all documents matching a basic query', function (done) {
      async.waterfall([
      function (cb) {
        d.insert({ somedata: 'ok' }, function (err) {
          d.insert({ somedata: 'again', plus: 'additional data' }, function (err) {
            d.insert({ somedata: 'again' }, function (err) { return cb(err); });
          });
        });
      }
      , function (cb) {   // Test with query that will return docs
        d.count({ somedata: 'again' }, function (err, docs) {
          assert.isNull(err);
          docs.should.equal(2);
          return cb();
        });
      }
      , function (cb) {   // Test with query that doesn't match anything
        d.count({ somedata: 'nope' }, function (err, docs) {
          assert.isNull(err);
          docs.should.equal(0);
          return cb();
        });
      }
      ], done);
    });

    it('Array fields match if any element matches', function (done) {
      d.insert({ fruits: ['pear', 'apple', 'banana'] }, function (err, doc1) {
        d.insert({ fruits: ['coconut', 'orange', 'pear'] }, function (err, doc2) {
          d.insert({ fruits: ['banana'] }, function (err, doc3) {
            d.count({ fruits: 'pear' }, function (err, docs) {
              assert.isNull(err);
              docs.should.equal(2);

              d.count({ fruits: 'banana' }, function (err, docs) {
                assert.isNull(err);
                docs.should.equal(2);

                d.count({ fruits: 'doesntexist' }, function (err, docs) {
                  assert.isNull(err);
                  docs.should.equal(0);

                  done();
                });
              });
            });
          });
        });
      });
    });

    it('Returns an error if the query is not well formed', function (done) {
      d.insert({ hello: 'world' }, function () {
        d.count({ $or: { hello: 'world' } }, function (err, docs) {
          assert.isDefined(err);
          assert.isUndefined(docs);

          done();
        });
      });
    });

  }); 

  describe('Update', function () {

    it("If the query doesn't match anything, database is not modified", function (done) {
      async.waterfall([
      function (cb) {
        d.insert({ somedata: 'ok' }, function (err) {
          d.insert({ somedata: 'again', plus: 'additional data' }, function (err) {
            d.insert({ somedata: 'another' }, function (err) { return cb(err); });
          });
        });
      }
      , function (cb) {   // Test with query that doesn't match anything
        d.update({ somedata: 'nope' }, { newDoc: 'yes' }, { multi: true }, function (err, n) {
          assert.isNull(err);
          n.should.equal(0);

          d.find({}, function (err, docs) {
            var doc1 = _.find(docs, function (d) { return d.somedata === 'ok'; })
              , doc2 = _.find(docs, function (d) { return d.somedata === 'again'; })
              , doc3 = _.find(docs, function (d) { return d.somedata === 'another'; })
              ;

            docs.length.should.equal(3);
            assert.isUndefined(_.find(docs, function (d) { return d.newDoc === 'yes'; }));

            assert.deepEqual(doc1, { _id: doc1._id, somedata: 'ok' });
            assert.deepEqual(doc2, { _id: doc2._id, somedata: 'again', plus: 'additional data' });
            assert.deepEqual(doc3, { _id: doc3._id, somedata: 'another' });

            return cb();
          });
        });
      }
      ], done);
    });

    it("Can update multiple documents matching the query", function (done) {
      var id1, id2, id3;

      // Test DB state after update and reload
      function testPostUpdateState (cb) {
        d.find({}, function (err, docs) {
          var doc1 = _.find(docs, function (d) { return d._id === id1; })
            , doc2 = _.find(docs, function (d) { return d._id === id2; })
            , doc3 = _.find(docs, function (d) { return d._id === id3; })
            ;

          docs.length.should.equal(3);

          Object.keys(doc1).length.should.equal(2);
          doc1.somedata.should.equal('ok');
          doc1._id.should.equal(id1);

          Object.keys(doc2).length.should.equal(2);
          doc2.newDoc.should.equal('yes');
          doc2._id.should.equal(id2);

          Object.keys(doc3).length.should.equal(2);
          doc3.newDoc.should.equal('yes');
          doc3._id.should.equal(id3);

          return cb();
        });
      }

      // Actually launch the tests
      async.waterfall([
      function (cb) {
        d.insert({ somedata: 'ok' }, function (err, doc1) {
          id1 = doc1._id;
          d.insert({ somedata: 'again', plus: 'additional data' }, function (err, doc2) {
            id2 = doc2._id;
            d.insert({ somedata: 'again' }, function (err, doc3) {
              id3 = doc3._id;
              return cb(err);
            });
          });
        });
      }
      , function (cb) {
        d.update({ somedata: 'again' }, { newDoc: 'yes' }, { multi: true }, function (err, n) {
          assert.isNull(err);
          n.should.equal(2);
          return cb();
        });
      }
      , async.apply(testPostUpdateState)
      , function (cb) {
        d.reload(function (err) { cb(err); });
      }
      , async.apply(testPostUpdateState)
      ], done);
    });

    it("Can update only one document matching the query", function (done) {
      var id1, id2, id3;

      // Test DB state after update and reload
      function testPostUpdateState (cb) {
        d.find({}, function (err, docs) {
          var doc1 = _.find(docs, function (d) { return d._id === id1; })
            , doc2 = _.find(docs, function (d) { return d._id === id2; })
            , doc3 = _.find(docs, function (d) { return d._id === id3; })
            ;

          docs.length.should.equal(3);

          assert.deepEqual(doc1, { somedata: 'ok', _id: doc1._id });

          // doc2 or doc3 was modified. Since we sort on _id and it is random
          // it can be either of two situations
          try {
            assert.deepEqual(doc2, { newDoc: 'yes', _id: doc2._id });
            assert.deepEqual(doc3, { somedata: 'again', _id: doc3._id });
          } catch (e) {
            assert.deepEqual(doc2, { somedata: 'again', plus: 'additional data', _id: doc2._id });
            assert.deepEqual(doc3, { newDoc: 'yes', _id: doc3._id });
          }

          return cb();
        });
      }

      // Actually launch the test
      async.waterfall([
      function (cb) {
        d.insert({ somedata: 'ok' }, function (err, doc1) {
          id1 = doc1._id;
          d.insert({ somedata: 'again', plus: 'additional data' }, function (err, doc2) {
            id2 = doc2._id;
            d.insert({ somedata: 'again' }, function (err, doc3) {
              id3 = doc3._id;
              return cb(err);
            });
          });
        });
      }
      , function (cb) {   // Test with query that doesn't match anything
        d.update({ somedata: 'again' }, { newDoc: 'yes' }, { multi: false }, function (err, n, doc) {
          assert.isNull(err);
          
          // Test if update returns first updated doc
          assert.isDefined(doc);
          doc.newDoc.should.equal('yes');

          n.should.equal(1);
          return cb();
        });
      }
      , async.apply(testPostUpdateState)
      , function (cb) {
        d.reload(function (err) { return cb(err); });
      }
      , async.apply(testPostUpdateState)   // The persisted state has been updated
      ], done);
    });


    it("Can update via modifier function", function(done) {
        d.insert([{ somedata: 'ok' }, { somedata: "again" }, { somedata: "againy" }], function (err) {
          d.update({somedata: "ok"}, function(doc) { doc.somedata+='o' }, {}, function(err) {
            assert.isNull(err);
            d.findOne({ somedata: "oko" }, function(err, doc) {
              assert.isNull(err);
              assert.isDefined(doc);
              doc.somedata.should.equal("oko");
              done();
            })

          });
        });
    });



    it("Can't change _id via modifier function", function(done) {
        d.insert([{ somedata: 'ok' }, { somedata: "again" }, { somedata: "againy" }], function (err) {
          d.update({somedata: "ok"}, function(doc) { doc._id+='o' }, {}, function(err) {
            assert.isDefined(err);
            done();
          });
        });
    });


    describe('Upserts', function () {
    
      it('Can perform upserts if needed', function (done) {
        d.update({ impossible: 'db is empty anyway' }, { newDoc: true }, {}, function (err, nr, upsert) {
          assert.isNull(err);
          nr.should.equal(0);
          assert.isUndefined(upsert);

          d.find({}, function (err, docs) {
            docs.length.should.equal(0);   // Default option for upsert is false

            d.update({ impossible: 'db is empty anyway' }, { something: "created ok" }, { upsert: true }, function (err, nr, newDoc) {
              assert.isNull(err);
              nr.should.equal(1);
              newDoc.something.should.equal("created ok");
              assert.isDefined(newDoc._id);

              d.find({}, function (err, docs) {
                docs.length.should.equal(1);   // Default option for upsert is false
                docs[0].something.should.equal("created ok");
                
                // Modifying the returned upserted document doesn't modify the database
                newDoc.newField = true;
                d.find({}, function (err, docs) {
                  docs[0].something.should.equal("created ok");
                  assert.isUndefined(docs[0].newField);
                
                  done();
                });
              });
            });
          });
        });
      });

      it('Can upsert with a modifier function', function (done) {
        d.update({ $or: [{ a: 4 }, { a: 5 }] }, function(doc) { 
          doc.hello = "world";
          doc.bloup = "blapp";
        }, { upsert: true }, function (err) {
          d.find({}, function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(1);
            var doc = docs[0];
            Object.keys(doc).length.should.equal(3);
            doc.hello.should.equal('world');
            doc.bloup.should.equal('blapp');
            done();
          });
        });
      });
            
      it('If the update query is a normal object with no modifiers, it is the doc that will be upserted', function (done) {
        d.update({ $or: [{ a: 4 }, { a: 5 }] }, { hello: 'world', bloup: 'blap' }, { upsert: true }, function (err) {
          d.find({}, function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(1);
            var doc = docs[0];
            Object.keys(doc).length.should.equal(3);
            doc.hello.should.equal('world');
            doc.bloup.should.equal('blap');
            done();
          });
        });
      });

      it('If the update query contains modifiers, it is applied to the object resulting from removing all operators from the find query 1', function (done) {
        d.update({ $or: [{ a: 4 }, { a: 5 }] }, { $set: { hello: 'world' }, $inc: { bloup: 3 } }, { upsert: true }, function (err) {
          d.find({ hello: 'world' }, function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(1);
            var doc = docs[0];
            Object.keys(doc).length.should.equal(3);
            doc.hello.should.equal('world');
            doc.bloup.should.equal(3);
            done();
          });
        });
      });
      
      it('If the update query contains modifiers, it is applied to the object resulting from removing all operators from the find query 2', function (done) {
        d.update({ $or: [{ a: 4 }, { a: 5 }], cac: 'rrr' }, { $set: { hello: 'world' }, $inc: { bloup: 3 } }, { upsert: true }, function (err) {
          d.find({ hello: 'world' }, function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(1);
            var doc = docs[0];
            Object.keys(doc).length.should.equal(4);
            doc.cac.should.equal('rrr');
            doc.hello.should.equal('world');
            doc.bloup.should.equal(3);
            done();
          });
        });
      });


    });   // ==== End of 'Upserts' ==== //

    it('Cannot perform update if the update query is not either registered-modifiers-only or copy-only, or contain badly formatted fields', function (done) {
      d.insert({ something: 'yup' }, function () {
        d.update({}, { boom: { $badfield: 5 } }, { multi: false }, function (err) {
          assert.isDefined(err);

          d.update({}, { boom: { "bad.field": 5 } }, { multi: false }, function (err) {
            assert.isDefined(err);

            d.update({}, { $inc: { test: 5 }, mixed: 'rrr' }, { multi: false }, function (err) {
              assert.isDefined(err);

              d.update({}, { $inexistent: { test: 5 } }, { multi: false }, function (err) {
                assert.isDefined(err);

                done();
              });
            });
          });
        });
      });
    });

    it('Can update documents using multiple modifiers', function (done) {
      var id;

      d.insert({ something: 'yup', other: 40 }, function (err, newDoc) {
        id = newDoc._id;

        d.update({}, { $set: { something: 'changed' }, $inc: { other: 10 } }, { multi: false }, function (err, nr) {
          assert.isNull(err);
          nr.should.equal(1);

          d.findOne({ _id: id }, function (err, doc) {
            Object.keys(doc).length.should.equal(3);
            doc._id.should.equal(id);
            doc.something.should.equal('changed');
            doc.other.should.equal(50);

            done();
          });
        });
      });
    });
    
    it('Cannot perform upsert with badly formatted fields', function(done) {
      d.update({_id: '1234'}, { $set: { $$badfield: 5 }}, { upsert: true }, function(err, doc) {
        assert.isDefined(err);
        done();
      })
    });

    it('Can upsert a document even with modifiers', function (done) {
      d.update({ bloup: 'blap' }, { $set: { hello: 'world' } }, { upsert: true }, function (err, nr, newDoc) {
        assert.isNull(err);
        nr.should.equal(1);
        newDoc.bloup.should.equal('blap');
        newDoc.hello.should.equal('world');
        assert.isDefined(newDoc._id);

        d.find({}, function (err, docs) {
          docs.length.should.equal(1);
          Object.keys(docs[0]).length.should.equal(3);
          docs[0].hello.should.equal('world');
          docs[0].bloup.should.equal('blap');
          assert.isDefined(docs[0]._id);

          done();
        });
      });
    });

    it('When using modifiers, the only way to update subdocs is with the dot-notation', function (done) {
      d.insert({ bloup: { blip: "blap", other: true } }, function () {
        // Correct methos
        d.update({}, { $set: { "bloup.blip": "hello" } }, {}, function () {
          d.findOne({}, function (err, doc) {
            doc.bloup.blip.should.equal("hello");
            doc.bloup.other.should.equal(true);

            // Wrong
            d.update({}, { $set: { bloup: { blip: "ola" } } }, {}, function () {
              d.findOne({}, function (err, doc) {
                doc.bloup.blip.should.equal("ola");
                assert.isUndefined(doc.bloup.other);   // This information was lost

                done();
              });
            });
          });
        });
      });
    });

    it('Returns an error if the query is not well formed', function (done) {
      d.insert({ hello: 'world' }, function () {
        d.update({ $or: { hello: 'world' } }, { a: 1 }, {}, function (err, nr, upsert) {
          assert.isDefined(err);
          assert.isUndefined(nr);
          assert.isUndefined(upsert);

          done();
        });
      });
    });

    it('If an error is thrown by a modifier, the database state is not changed', function (done) {
      d.insert({ hello: 'world' }, function (err, newDoc) {
        d.update({}, { $inc: { hello: 4 } }, {}, function (err, nr) {
          assert.isDefined(err);
          assert.isUndefined(nr);

          d.find({}, function (err, docs) {
            assert.deepEqual(docs, [ { _id: newDoc._id, hello: 'world' } ]);

            done();
          });
        });
      });
    });

    it('Cant change the _id of a document', function (done) {
      d.insert({ a: 2 }, function (err, newDoc) {
        d.update({ a: 2 }, { a: 2, _id: 'nope' }, {}, function (err) {
          assert.isDefined(err);

          d.find({}, function (err, docs) {
            docs.length.should.equal(1);
            Object.keys(docs[0]).length.should.equal(2);
            docs[0].a.should.equal(2);
            docs[0]._id.should.equal(newDoc._id);

            d.update({ a: 2 }, { $set: { _id: 'nope' } }, {}, function (err) {
              assert.isDefined(err);

              d.find({}, function (err, docs) {
                docs.length.should.equal(1);
                Object.keys(docs[0]).length.should.equal(2);
                docs[0].a.should.equal(2);
                docs[0]._id.should.equal(newDoc._id);

                done();
              });
            });
          });
        });
      });
    });

    it('Non-multi updates are persistent', function (done) {
      d.insert({ a:1, hello: 'world' }, function (err, doc1) {
        d.insert({ a:2, hello: 'earth' }, function (err, doc2) {
          d.update({ a: 2 }, { $set: { hello: 'changed' } }, {}, function (err) {
            assert.isNull(err);

            d.find({}, function (err, docs) {
              docs.sort(function (a, b) { return a.a - b.a; });
              docs.length.should.equal(2);

              assert.deepEqual(docs[0], { _id: doc1._id, a:1, hello: 'world' });
              assert.deepEqual(docs[1], { _id: doc2._id, a:2, hello: 'changed' });

              // Even after a reload the database state hasn't changed
              d.reload(function (err) {
                assert.isNull(err);

                d.find({}, function (err, docs) {
                  docs.sort(function (a, b) { return a.a - b.a; });
                  docs.length.should.equal(2);
                  assert.deepEqual(docs[0], { _id: doc1._id, a:1, hello: 'world' });
                  assert.deepEqual(docs[1], { _id: doc2._id, a:2, hello: 'changed' });

                  done();
                });
              });
            });
          });
        });
      });
    });

    it('Multi updates are persistent', function (done) {
      d.insert({ a:1, hello: 'world' }, function (err, doc1) {
        d.insert({ a:2, hello: 'earth' }, function (err, doc2) {
          d.insert({ a:5, hello: 'pluton' }, function (err, doc3) {
            d.update({ a: { $in: [1, 2] } }, { $set: { hello: 'changed' } }, { multi: true }, function (err) {
              assert.isNull(err);

              d.find({}, function (err, docs) {
                docs.sort(function (a, b) { return a.a - b.a; });
                docs.length.should.equal(3);
                assert.deepEqual(docs[0], { _id: doc1._id, a:1, hello: 'changed' });
                assert.deepEqual(docs[1], { _id: doc2._id, a:2, hello: 'changed' });
                assert.deepEqual(docs[2], { _id: doc3._id, a:5, hello: 'pluton' });

                // Even after a reload the database state hasn't changed
                d.reload(function (err) {
                  assert.isNull(err);

                  d.find({}, function (err, docs) {
                    docs.sort(function (a, b) { return a.a - b.a; });
                    docs.length.should.equal(3);
                    assert.deepEqual(docs[0], { _id: doc1._id, a:1, hello: 'changed' });
                    assert.deepEqual(docs[1], { _id: doc2._id, a:2, hello: 'changed' });
                    assert.deepEqual(docs[2], { _id: doc3._id, a:5, hello: 'pluton' });

                    done();
                  });
                });
              });
            });
          });
        });
      });
    });
    
    it('Can update without the options arg (will use defaults then)', function (done) {
      d.insert({ a:1, hello: 'world' }, function (err, doc1) {
        d.insert({ a:2, hello: 'earth' }, function (err, doc2) {
          d.insert({ a:5, hello: 'pluton' }, function (err, doc3) {
            d.update({ a: 2 }, { $inc: { a: 10 } }, function (err, nr) {
              assert.isNull(err);
              nr.should.equal(1);
              d.find({}, function (err, docs) {
                var d1 = _.find(docs, function (doc) { return doc._id === doc1._id })
                  , d2 = _.find(docs, function (doc) { return doc._id === doc2._id })
                  , d3 = _.find(docs, function (doc) { return doc._id === doc3._id })
                  ;
                  
                d1.a.should.equal(1);
                d2.a.should.equal(12);
                d3.a.should.equal(5);
                
                done();
              });
            });
          });
        });
      });
    });

    it('If a multi update fails on one document, previous updates should be rolled back', function (done) {
      d.ensureIndex({ fieldName: 'a' });
      d.insert({ a: 4 }, function (err, doc1) {
        d.insert({ a: 5 }, function (err, doc2) {
          d.insert({ a: 'abc' }, function (err, doc3) {
            // With this query, candidates are always returned in the order 4, 5, 'abc' so it's always the last one which fails
            d.update({ a: { $in: [4, 5, 'abc'] } }, { $inc: { a: 10 } }, { multi: true }, function (err) {
              assert.isDefined(err);

              // No index modified
              async.each(d.indexes, function (index, cb) {
                var docs = index.getAll();
                async.map(docs, d.findById.bind(d), function(err, docs) {
                  var d1 = _.find(docs, function (doc) { return doc._id === doc1._id })
                    , d2 = _.find(docs, function (doc) { return doc._id === doc2._id })
                    , d3 = _.find(docs, function (doc) { return doc._id === doc3._id })
                    ;

                  // All changes rolled back, including those that didn't trigger an error
                  d1.a.should.equal(4);
                  d2.a.should.equal(5);
                  d3.a.should.equal('abc');
                }, cb);
              }, done);
            });
          });
        });
      });
    });

    it('If an index constraint is violated by an update, all changes should be rolled back', function (done) {
      d.ensureIndex({ fieldName: 'a', unique: true });
      d.insert({ a: 4 }, function (err, doc1) {
        d.insert({ a: 5 }, function (err, doc2) {
          // With this query, candidates are always returned in the order 4, 5, 'abc' so it's always the last one which fails
           d.update({ a: { $in: [4, 5, 'abc'] } }, { $set: { a: 10 } }, { multi: true }, function (err) {
            assert.isDefined(err);

            // Check that no index was modified
            async.each(d.indexes, function (index, cb) {
              var docs = index.getAll();
              async.map(docs, d.findById.bind(d), function(err, docs) {
                var d1 = _.find(docs, function (doc) { return doc._id === doc1._id })
                  , d2 = _.find(docs, function (doc) { return doc._id === doc2._id })
                  ;

                // All changes rolled back, including those that didn't trigger an error
                d1.a.should.equal(4);
                d2.a.should.equal(5);
              }, cb);
            }, done);

          });
        });
      });
    });


    it('Updates are atomic', function (done) {
      d.insert({ a: 4 }, function (err, doc1) {
        // With this query, candidates are always returned in the order 4, 5, 'abc' so it's always the last one which fails
         async.parallel([
          function(cb) { d.update({ a: { $in: [4, 5, 'abc'] } }, { $inc: { a: 1 } }, { multi: true }, cb) },
          function(cb) { d.update({ a: { $in: [4, 5, 'abc'] } }, { $inc: { a: 1 } }, { multi: true }, cb) }     
        ]     
         , function (err) {
          assert.isUndefined(err);

          d.findOne({  }, function(err,doc) {
            doc.a.should.equal(6);
            done();
          });
        });
      });
    });


  });   // ==== End of 'Update' ==== //


  describe('Remove', function () {

    it('Can remove multiple documents', function (done) {
      var id1, id2, id3;

      // Test DB status
      function testPostUpdateState (cb) {
        d.find({}, function (err, docs) {
          docs.length.should.equal(1);

          Object.keys(docs[0]).length.should.equal(2);
          docs[0]._id.should.equal(id1);
          docs[0].somedata.should.equal('ok');

          return cb();
        });
      }

      // Actually launch the test
      async.waterfall([
      function (cb) {
        d.insert({ somedata: 'ok' }, function (err, doc1) {
          id1 = doc1._id;
          d.insert({ somedata: 'again', plus: 'additional data' }, function (err, doc2) {
            id2 = doc2._id;
            d.insert({ somedata: 'again' }, function (err, doc3) {
              id3 = doc3._id;
              return cb(err);
            });
          });
        });
      }
      , function (cb) {   // Test with query that doesn't match anything
        d.remove({ somedata: 'again' }, { multi: true }, function (err, n) {
          assert.isNull(err);
          n.should.equal(2);
          return cb();
        });
      }
      , async.apply(testPostUpdateState)
      , function (cb) {
        d.reload(function (err) { return cb(err); });
      }
      , async.apply(testPostUpdateState)
      ], done);
    });

    // This tests concurrency issues
    it('Remove can be called multiple times in parallel and everything that needs to be removed will be', function (done) {
      d.insert({ planet: 'Earth' }, function () {
        d.insert({ planet: 'Mars' }, function () {
          d.insert({ planet: 'Saturn' }, function () {
            d.find({}, function (err, docs) {
              docs.length.should.equal(3);

              // Remove two docs simultaneously
              var toRemove = ['Mars', 'Saturn'];
              async.each(toRemove, function(planet, cb) {
                d.remove({ planet: planet }, function (err) { return cb(err); });
              }, function (err) {
                d.find({}, function (err, docs) {
                  docs.length.should.equal(1);

                  done();
                });
              });
            });
          });
        });
      });
    });

    it('Returns an error if the query is not well formed', function (done) {
      d.insert({ hello: 'world' }, function () {
        d.remove({ $or: { hello: 'world' } }, {}, function (err, nr, upsert) {
          assert.isNotNull(err);
          assert.isDefined(err);

          assert.isUndefined(nr);
          assert.isUndefined(upsert);

          done();
        });
      });
    });

    it('Non-multi removes are persistent', function (done) {
      d.insert({ a:1, hello: 'world' }, function (err, doc1) {
        d.insert({ a:2, hello: 'earth' }, function (err, doc2) {
          d.insert({ a:3, hello: 'moto' }, function (err, doc3) {
            d.remove({ a: 2 }, {}, function (err) {
              assert.isNull(err);

              d.find({}, function (err, docs) {
                docs.sort(function (a, b) { return a.a - b.a; });
                docs.length.should.equal(2);
                assert.deepEqual(docs[0], { _id: doc1._id, a:1, hello: 'world' });
                assert.deepEqual(docs[1], { _id: doc3._id, a:3, hello: 'moto' });

                // Even after a reload the database state hasn't changed
                d.reload(function (err) {
                  assert.isNull(err);

                  d.find({}, function (err, docs) {
                    docs.sort(function (a, b) { return a.a - b.a; });
                    docs.length.should.equal(2);
                    assert.deepEqual(docs[0], { _id: doc1._id, a:1, hello: 'world' });
                    assert.deepEqual(docs[1], { _id: doc3._id, a:3, hello: 'moto' });

                    done();
                  });
                });
              });
            });
          });
        });
      });
    });

    it('Multi removes are persistent', function (done) {
      d.insert({ a:1, hello: 'world' }, function (err, doc1) {
        d.insert({ a:2, hello: 'earth' }, function (err, doc2) {
          d.insert({ a:3, hello: 'moto' }, function (err, doc3) {
            d.remove({ a: { $in: [1, 3] } }, { multi: true }, function (err) {
              assert.isNull(err);

              d.find({}, function (err, docs) {
                docs.length.should.equal(1);
                assert.deepEqual(docs[0], { _id: doc2._id, a:2, hello: 'earth' });

                // Even after a reload the database state hasn't changed
                d.reload(function (err) {
                  assert.isNull(err);

                  d.find({}, function (err, docs) {
                    docs.length.should.equal(1);
                    assert.deepEqual(docs[0], { _id: doc2._id, a:2, hello: 'earth' });

                    done();
                  });
                });
              });
            });
          });
        });
      });
    });
    
    it('Can remove without the options arg (will use defaults then)', function (done) {
      d.insert({ a:1, hello: 'world' }, function (err, doc1) {
        d.insert({ a:2, hello: 'earth' }, function (err, doc2) {
          d.insert({ a:5, hello: 'pluton' }, function (err, doc3) {
            d.remove({ a: 2 }, function (err, nr) {
              assert.isNull(err);
              nr.should.equal(1);
              d.find({}, function (err, docs) {
                var d1 = _.find(docs, function (doc) { return doc._id === doc1._id })
                  , d2 = _.find(docs, function (doc) { return doc._id === doc2._id })
                  , d3 = _.find(docs, function (doc) { return doc._id === doc3._id })
                  ;
                  
                d1.a.should.equal(1);
                assert.isUndefined(d2);
                d3.a.should.equal(5);
                
                done();
              });
            });
          });
        });
      });
    });


    describe('Events', function () {

      describe('when a document is removed', function () {
        it('emits the removed event with the doc', function (done) {
          var id;
          d.on('removed', function (docs) {
            remove_ids(docs);
            docs.should.eql([id]);
            done();
          });
          d.insert({ a: 1, b: 'foo' }, function (err, doc) {
            if (err) throw err;
            id = doc._id;
            d.remove({ a: 1 }, {}, function (err) {
              if (err) throw err;
            });
          });
        });
      });

      describe('when multiple documents are removed', function () {
        it('emits the removed event with the docs', function (done) {
          d.on('removed', function (docs) {
            remove_ids(docs);                      
            docs.length.should.equal(2);
            done();
          });
          d.insert([{ a: 1, b: 'foo' }, { a: 2, b: 'foo' }], function (err) {
            if (err) throw err;            
            d.remove({ b: 'foo' }, { multi:true }, function (err) {
              if (err) throw err;              
            });
          });
        });
      });


    });
  });   // ==== End of 'Remove' ==== //


  describe('Using indexes', function () {
    
    describe('ensureIndex and index initialization in database loading', function () {
      /*
      it('ensureIndex can be called right after a reload and be initialized and filled correctly', function (done) {
        var now = new Date()
          , rawData = document.serialize({ _id: "aaa", z: "1", a: 2, ages: [1, 5, 12] }) + '\n' +
                      document.serialize({ _id: "bbb", z: "2", hello: 'world' }) + '\n' +
                      document.serialize({ _id: "ccc", z: "3", nested: { today: now } })
          ;

        d.getAllData().length.should.equal(0);

        fs.writeFile(testDb, rawData, 'utf8', function () {
          d.reload(function () {
            d.getAllData().length.should.equal(3);

            assert.deepEqual(Object.keys(d.indexes), ['_id']);

            d.ensureIndex({ fieldName: 'z' });
            d.indexes.z.fieldName.should.equal('z');
            d.indexes.z.unique.should.equal(false);
            d.indexes.z.sparse.should.equal(false);
            d.indexes.z.tree.getNumberOfKeys().should.equal(3);
            d.indexes.z.tree.search('1')[0].should.equal(d.getAllData()[0]);
            d.indexes.z.tree.search('2')[0].should.equal(d.getAllData()[1]);
            d.indexes.z.tree.search('3')[0].should.equal(d.getAllData()[2]);

            done();
          });
        });
      });

      it('ensureIndex can be called twice on the same field, the second call will have no effect', function (done) {
        Object.keys(d.indexes).length.should.equal(1);
        Object.keys(d.indexes)[0].should.equal("_id");
      
        d.insert({ planet: "Earth" }, function () {
          d.insert({ planet: "Mars" }, function () {
            d.find({}, function (err, docs) {
              docs.length.should.equal(2);
              
              d.ensureIndex({ fieldName: "planet" }, function (err) {
                assert.isNull(err);
                Object.keys(d.indexes).length.should.equal(2);
                Object.keys(d.indexes)[0].should.equal("_id");   
                Object.keys(d.indexes)[1].should.equal("planet");   

                d.indexes.planet.getAll().length.should.equal(2);
                
                // This second call has no effect, documents don't get inserted twice in the index
                d.ensureIndex({ fieldName: "planet" }, function (err) {
                  assert.isNull(err);
                  Object.keys(d.indexes).length.should.equal(2);
                  Object.keys(d.indexes)[0].should.equal("_id");   
                  Object.keys(d.indexes)[1].should.equal("planet");   

                  d.indexes.planet.getAll().length.should.equal(2);                
                  
                  done();
                });
              });
            });
          });
        });
      });

      it('ensureIndex can be called after the data set was modified and the index still be correct', function (done) {
        var rawData = document.serialize({ _id: "aaa", z: "1", a: 2, ages: [1, 5, 12] }) + '\n' +
                      document.serialize({ _id: "bbb", z: "2", hello: 'world' })
          ;

        d.getAllData().length.should.equal(0);

        fs.writeFile(testDb, rawData, 'utf8', function () {
          d.reload(function () {
            d.getAllData().length.should.equal(2);

            assert.deepEqual(Object.keys(d.indexes), ['_id']);

            d.insert({ z: "12", yes: 'yes' }, function (err, newDoc1) {
              d.insert({ z: "14", nope: 'nope' }, function (err, newDoc2) {
                d.remove({ z: "2" }, {}, function () {
                  d.update({ z: "1" }, { $set: { 'yes': 'yep' } }, {}, function () {
                    assert.deepEqual(Object.keys(d.indexes), ['_id']);

                    d.ensureIndex({ fieldName: 'z' });
                    d.indexes.z.fieldName.should.equal('z');
                    d.indexes.z.unique.should.equal(false);
                    d.indexes.z.sparse.should.equal(false);
                    d.indexes.z.tree.getNumberOfKeys().should.equal(3);

                    // The pointers in the _id and z indexes are the same
                    d.indexes.z.tree.search('1')[0].should.equal(d.indexes._id.getMatching('aaa')[0]);
                    d.indexes.z.tree.search('12')[0].should.equal(d.indexes._id.getMatching(newDoc1._id)[0]);
                    d.indexes.z.tree.search('14')[0].should.equal(d.indexes._id.getMatching(newDoc2._id)[0]);

                    // The data in the z index is correct
                    d.find({}, function (err, docs) {
                      var doc0 = _.find(docs, function (doc) { return doc._id === 'aaa'; })
                        , doc1 = _.find(docs, function (doc) { return doc._id === newDoc1._id; })
                        , doc2 = _.find(docs, function (doc) { return doc._id === newDoc2._id; })
                        ;

                      docs.length.should.equal(3);

                      assert.deepEqual(doc0, { _id: "aaa", z: "1", a: 2, ages: [1, 5, 12], yes: 'yep' });
                      assert.deepEqual(doc1, { _id: newDoc1._id, z: "12", yes: 'yes' });
                      assert.deepEqual(doc2, { _id: newDoc2._id, z: "14", nope: 'nope' });

                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });

      it('ensureIndex can be called before a reload and still be initialized and filled correctly', function (done) {
        var now = new Date()
          , rawData = document.serialize({ _id: "aaa", z: "1", a: 2, ages: [1, 5, 12] }) + '\n' +
                      document.serialize({ _id: "bbb", z: "2", hello: 'world' }) + '\n' +
                      document.serialize({ _id: "ccc", z: "3", nested: { today: now } })
          ;

        d.getAllData().length.should.equal(0);

        d.ensureIndex({ fieldName: 'z' });
        d.indexes.z.fieldName.should.equal('z');
        d.indexes.z.unique.should.equal(false);
        d.indexes.z.sparse.should.equal(false);
        d.indexes.z.tree.getNumberOfKeys().should.equal(0);

        fs.writeFile(testDb, rawData, 'utf8', function () {
          d.reload(function () {
            var doc1 = _.find(d.getAllData(), function (doc) { return doc.z === "1"; })
              , doc2 = _.find(d.getAllData(), function (doc) { return doc.z === "2"; })
              , doc3 = _.find(d.getAllData(), function (doc) { return doc.z === "3"; })
              ;

            d.getAllData().length.should.equal(3);

            d.indexes.z.tree.getNumberOfKeys().should.equal(3);
            d.indexes.z.tree.search('1')[0].should.equal(doc1);
            d.indexes.z.tree.search('2')[0].should.equal(doc2);
            d.indexes.z.tree.search('3')[0].should.equal(doc3);

            done();
          });
        });
      });

      it('Can initialize multiple indexes on a database load', function (done) {
        var now = new Date()
          , rawData = document.serialize({ _id: "aaa", z: "1", a: 2, ages: [1, 5, 12] }) + '\n' +
                      document.serialize({ _id: "bbb", z: "2", a: 'world' }) + '\n' +
                      document.serialize({ _id: "ccc", z: "3", a: { today: now } })
          ;

        d.getAllData().length.should.equal(0);

        d.ensureIndex({ fieldName: 'z' });
        d.ensureIndex({ fieldName: 'a' });
        d.indexes.a.tree.getNumberOfKeys().should.equal(0);
        d.indexes.z.tree.getNumberOfKeys().should.equal(0);

        fs.writeFile(testDb, rawData, 'utf8', function () {
          d.reload(function () {
            var doc1 = _.find(d.getAllData(), function (doc) { return doc.z === "1"; })
              , doc2 = _.find(d.getAllData(), function (doc) { return doc.z === "2"; })
              , doc3 = _.find(d.getAllData(), function (doc) { return doc.z === "3"; })
              ;

            d.getAllData().length.should.equal(3);

            d.indexes.z.tree.getNumberOfKeys().should.equal(3);
            d.indexes.z.tree.search('1')[0].should.equal(doc1);
            d.indexes.z.tree.search('2')[0].should.equal(doc2);
            d.indexes.z.tree.search('3')[0].should.equal(doc3);

            d.indexes.a.tree.getNumberOfKeys().should.equal(3);
            d.indexes.a.tree.search(2)[0].should.equal(doc1);
            d.indexes.a.tree.search('world')[0].should.equal(doc2);
            d.indexes.a.tree.search({ today: now })[0].should.equal(doc3);

            done();
          });
        });
      });

      it('If a unique constraint is not respected, database loading will not work and no data will be inserted', function (done) {
        var now = new Date()
          , rawData = document.serialize({ _id: "aaa", z: "1", a: 2, ages: [1, 5, 12] }) + '\n' +
                      document.serialize({ _id: "bbb", z: "2", a: 'world' }) + '\n' +
                      document.serialize({ _id: "ccc", z: "1", a: { today: now } })
          ;

        d.getAllData().length.should.equal(0);

        d.ensureIndex({ fieldName: 'z', unique: true });
        d.indexes.z.tree.getNumberOfKeys().should.equal(0);

        fs.writeFile(testDb, rawData, 'utf8', function () {
          d.reload(function (err) {
            err.errorType.should.equal('uniqueViolated');
            err.key.should.equal("1");
            d.getAllData().length.should.equal(0);
            d.indexes.z.tree.getNumberOfKeys().should.equal(0);

            done();
          });
        });
      });

      it('If a unique constraint is not respected, ensureIndex will return an error and not create an index', function (done) {
        d.insert({ a: 1, b: 4 }, function () {
          d.insert({ a: 2, b: 45 }, function () {
            d.insert({ a: 1, b: 3 }, function () {
              d.ensureIndex({ fieldName: 'b' }, function (err) {
                assert.isNull(err);

                d.ensureIndex({ fieldName: 'a', unique: true }, function (err) {
                  err.errorType.should.equal('uniqueViolated');
                  assert.deepEqual(Object.keys(d.indexes), ['_id', 'b']);

                  done();
                });
              });
            });
          });
        });
      });
      
      it('Can remove an index', function (done) {
        d.ensureIndex({ fieldName: 'e' }, function (err) {
          assert.isNull(err);
          
          Object.keys(d.indexes).length.should.equal(2);
          assert.isNotNull(d.indexes.e);
          
          d.removeIndex("e", function (err) {
            assert.isNull(err);
            Object.keys(d.indexes).length.should.equal(1);
            assert.isUndefined(d.indexes.e); 
 
            done();
          });
        });
      });
    */

    });   // ==== End of 'ensureIndex and index initialization in database loading' ==== //

    
    describe('Indexing newly inserted documents', function () {

      it('Newly inserted documents are indexed', function (done) {
        d.ensureIndex({ fieldName: 'z' });
        d.indexes.z.tree.getNumberOfKeys().should.equal(0);

        d.insert({ a: 2, z: 'yes' }, function (err, newDoc) {
          d.indexes.z.tree.getNumberOfKeys().should.equal(1);
          assert.deepEqual(d.indexes.z.getMatching('yes'), [newDoc._id]);

          d.insert({ a: 5, z: 'nope' }, function (err, newDoc) {
            d.indexes.z.tree.getNumberOfKeys().should.equal(2);
            assert.deepEqual(d.indexes.z.getMatching('nope'), [newDoc._id]);

            done();
          });
        });
      });

      it('If multiple indexes are defined, the document is inserted in all of them', function (done) {
        d.ensureIndex({ fieldName: 'z' });
        d.ensureIndex({ fieldName: 'ya' });
        d.indexes.z.tree.getNumberOfKeys().should.equal(0);

        d.insert({ a: 2, z: 'yes', ya: 'indeed' }, function (err, newDoc) {
          d.indexes.z.tree.getNumberOfKeys().should.equal(1);
          d.indexes.ya.tree.getNumberOfKeys().should.equal(1);
          assert.deepEqual(d.indexes.z.getMatching('yes'), [newDoc._id]);
          assert.deepEqual(d.indexes.ya.getMatching('indeed'), [newDoc._id]);

          d.insert({ a: 5, z: 'nope', ya: 'sure' }, function (err, newDoc2) {
            d.indexes.z.tree.getNumberOfKeys().should.equal(2);
            d.indexes.ya.tree.getNumberOfKeys().should.equal(2);
            assert.deepEqual(d.indexes.z.getMatching('nope'), [newDoc2._id]);
            assert.deepEqual(d.indexes.ya.getMatching('sure'), [newDoc2._id]);

            done();
          });
        });
      });

      it('Can insert two docs at the same key for a non unique index', function (done) {
        d.ensureIndex({ fieldName: 'z' });
        d.indexes.z.tree.getNumberOfKeys().should.equal(0);

        d.insert({ a: 2, z: 'yes' }, function (err, newDoc) {
          d.indexes.z.tree.getNumberOfKeys().should.equal(1);
          assert.deepEqual(d.indexes.z.getMatching('yes'), [newDoc._id]);

          d.insert({ a: 5, z: 'yes' }, function (err, newDoc2) {
            d.indexes.z.tree.getNumberOfKeys().should.equal(1);
            assert.deepEqual(d.indexes.z.getMatching('yes'), [newDoc._id, newDoc2._id]);

            done();
          });
        });
      });

      it('If the index has a unique constraint, an error is thrown if it is violated and the data is not modified', function (done) {
        d.ensureIndex({ fieldName: 'y', unique: true });
        d.indexes.y.tree.getNumberOfKeys().should.equal(0);

        d.insert({ a: 2, y: 'yes' }, function (err, newDoc) {
          d.indexes.y.tree.getNumberOfKeys().should.equal(1);
          assert.deepEqual(d.indexes.y.getMatching('yes'), [newDoc._id]);

          d.insert({ a: 5, y: 'yes' }, function (err) {
            assert.isNotNull(err);
            err.errorType.should.equal('uniqueViolated');
            err.key.should.equal('yes');

            // Index didn't change
            d.indexes.y.tree.getNumberOfKeys().should.equal(1);
            assert.deepEqual(d.indexes.y.getMatching('yes'), [newDoc._id]);

            // Data didn't change
            assert.deepEqual(d.getAllData(), [newDoc._id]);
            d.reload(function () {
              d.find({}, function(err, docs) {
                docs.length.should.equal(1);
                assert.deepEqual(docs[0], newDoc);

                done();
              });
            });
          });
        });
      });

      it('If an index has a unique constraint, other indexes cannot be modified when it raises an error', function (done) {
        d.ensureIndex({ fieldName: 'nonu1' });
        d.ensureIndex({ fieldName: 'uni', unique: true });
        d.ensureIndex({ fieldName: 'nonu2' });

        d.insert({ nonu1: 'yes', nonu2: 'yes2', uni: 'willfail' }, function (err, newDoc) {
          assert.isNull(err);
          d.indexes.nonu1.tree.getNumberOfKeys().should.equal(1);
          d.indexes.uni.tree.getNumberOfKeys().should.equal(1);
          d.indexes.nonu2.tree.getNumberOfKeys().should.equal(1);

          d.insert({ nonu1: 'no', nonu2: 'no2', uni: 'willfail' }, function (err) {
            err.errorType.should.equal('uniqueViolated');

            // No index was modified
            d.indexes.nonu1.tree.getNumberOfKeys().should.equal(1);
            d.indexes.uni.tree.getNumberOfKeys().should.equal(1);
            d.indexes.nonu2.tree.getNumberOfKeys().should.equal(1);

            assert.deepEqual(d.indexes.nonu1.getMatching('yes'), [newDoc._id]);
            assert.deepEqual(d.indexes.uni.getMatching('willfail'), [newDoc._id]);
            assert.deepEqual(d.indexes.nonu2.getMatching('yes2'), [newDoc._id]);

            done();
          });
        });
      });

      it('Unique indexes prevent you from inserting two docs where the field is undefined except if theyre sparse', function (done) {
        d.ensureIndex({ fieldName: 'zzz', unique: true });
        d.indexes.zzz.tree.getNumberOfKeys().should.equal(0);

        d.insert({ a: 2, z: 'yes' }, function (err, newDoc) {
          d.indexes.zzz.tree.getNumberOfKeys().should.equal(1);
          assert.deepEqual(d.indexes.zzz.getMatching(undefined), [newDoc._id]);

          d.insert({ a: 5, z: 'other' }, function (err) {
            err.errorType.should.equal('uniqueViolated');
            assert.isUndefined(err.key);

            d.ensureIndex({ fieldName: 'yyy', unique: true, sparse: true });

            d.insert({ a: 5, z: 'other', zzz: 'set' }, function (err) {
              assert.isNull(err);
              d.indexes.yyy.getAll().length.should.equal(0);   // Nothing indexed
              d.indexes.zzz.getAll().length.should.equal(2);

              done();
            });
          });
        });
      });

      it('Insertion still works as before with indexing', function (done) {
        d.ensureIndex({ fieldName: 'a' });
        d.ensureIndex({ fieldName: 'b' });

        d.insert({ a: 1, b: 'hello' }, function (err, doc1) {
          d.insert({ a: 2, b: 'si' }, function (err, doc2) {
            d.find({}, function (err, docs) {
              assert.deepEqual(doc1, _.find(docs, function (d) { return d._id === doc1._id; }));
              assert.deepEqual(doc2, _.find(docs, function (d) { return d._id === doc2._id; }));

              done();
            });
          });
        });
      });

      it('All indexes point to the same data as the main index on _id', function (done) {
        d.ensureIndex({ fieldName: 'a' });

        d.insert({ a: 1, b: 'hello' }, function (err, doc1) {
          d.insert({ a: 2, b: 'si' }, function (err, doc2) {
            d.find({}, function (err, docs) {
              docs.length.should.equal(2);
              d.getAllData().length.should.equal(2);

              d.indexes._id.getMatching(doc1._id).length.should.equal(1);
              d.indexes.a.getMatching(1).length.should.equal(1);
              d.indexes._id.getMatching(doc1._id)[0].should.equal(d.indexes.a.getMatching(1)[0]);

              d.indexes._id.getMatching(doc2._id).length.should.equal(1);
              d.indexes.a.getMatching(2).length.should.equal(1);
              d.indexes._id.getMatching(doc2._id)[0].should.equal(d.indexes.a.getMatching(2)[0]);

              done();
            });
          });
        });
      });

      it('If a unique constraint is violated, no index is changed, including the main one', function (done) {
        d.ensureIndex({ fieldName: 'a', unique: true });

        d.insert({ a: 1, b: 'hello' }, function (err, doc1) {
          d.insert({ a: 1, b: 'si' }, function (err) {
            assert.isDefined(err);

            d.find({}, function (err, docs) {
              docs.length.should.equal(1);
              d.getAllData().length.should.equal(1);

              d.indexes._id.getMatching(doc1._id).length.should.equal(1);
              d.indexes.a.getMatching(1).length.should.equal(1);
              d.indexes._id.getMatching(doc1._id)[0].should.equal(d.indexes.a.getMatching(1)[0]);

              d.indexes.a.getMatching(2).length.should.equal(0);

              done();
            });
          });
        });
      });

    });   // ==== End of 'Indexing newly inserted documents' ==== //

    describe('Updating indexes upon document update', function () {

      it('Updating docs still works as before with indexing', function (done) {
        d.ensureIndex({ fieldName: 'a' });

        d.insert({ a: 1, b: 'hello' }, function (err, _doc1) {
          d.insert({ a: 2, b: 'si' }, function (err, _doc2) {
            d.update({ a: 1 }, { $set: { a: 456, b: 'no' } }, {}, function (err, nr) {
              var data = d.getAllData();
              async.map(data, d.findById.bind(d), function(err, data) {
                var doc1 = _.find(data, function (doc) { return doc._id === _doc1._id; })
                  , doc2 = _.find(data, function (doc) { return doc._id === _doc2._id; })
                  ;

                assert.isUndefined(err);
                nr.should.equal(1);

                data.length.should.equal(2);
                assert.deepEqual(doc1, { a: 456, b: 'no', _id: _doc1._id });
                assert.deepEqual(doc2, { a: 2, b: 'si', _id: _doc2._id });

                d.update({}, { $inc: { a: 10 }, $set: { b: 'same' } }, { multi: true }, function (err, nr) {
                  var data = d.getAllData();
                  async.map(data, d.findById.bind(d), function(err, data) {

                    var doc1 = _.find(data, function (doc) { return doc._id === _doc1._id; })
                      , doc2 = _.find(data, function (doc) { return doc._id === _doc2._id; })
                      ;

                    assert.isUndefined(err);
                    nr.should.equal(2);

                    data.length.should.equal(2);
                    assert.deepEqual(doc1, { a: 466, b: 'same', _id: _doc1._id });
                    assert.deepEqual(doc2, { a: 12, b: 'same', _id: _doc2._id });

                    done();                  
                  });
                });
              });

            });
          });
        });
      });

      it('Indexes get updated when a document (or multiple documents) is updated', function (done) {
        d.ensureIndex({ fieldName: 'a' });
        d.ensureIndex({ fieldName: 'b' });

        d.insert({ a: 1, b: 'hello' }, function (err, doc1) {
          d.insert({ a: 2, b: 'si' }, function (err, doc2) {
            // Simple update
            d.update({ a: 1 }, { $set: { a: 456, b: 'no' } }, {}, function (err, nr) {
              assert.isNull(err);
              nr.should.equal(1);

              d.indexes.a.tree.getNumberOfKeys().should.equal(2);
              d.indexes.a.getMatching(456)[0].should.equal(doc1._id);
              d.indexes.a.getMatching(2)[0].should.equal(doc2._id);

              d.indexes.b.tree.getNumberOfKeys().should.equal(2);
              d.indexes.b.getMatching('no')[0].should.equal(doc1._id);
              d.indexes.b.getMatching('si')[0].should.equal(doc2._id);

              // The same pointers are shared between all indexes
              d.indexes.a.tree.getNumberOfKeys().should.equal(2);
              d.indexes.b.tree.getNumberOfKeys().should.equal(2);
              d.indexes._id.tree.getNumberOfKeys().should.equal(2);
              d.indexes.a.getMatching(456)[0].should.equal(d.indexes._id.getMatching(doc1._id)[0]);
              d.indexes.b.getMatching('no')[0].should.equal(d.indexes._id.getMatching(doc1._id)[0]);
              d.indexes.a.getMatching(2)[0].should.equal(d.indexes._id.getMatching(doc2._id)[0]);
              d.indexes.b.getMatching('si')[0].should.equal(d.indexes._id.getMatching(doc2._id)[0]);

              // Multi update
              d.update({}, { $inc: { a: 10 }, $set: { b: 'same' } }, { multi: true }, function (err, nr) {
                assert.isNull(err);
                nr.should.equal(2);

                d.indexes.a.tree.getNumberOfKeys().should.equal(2);
                d.indexes.a.getMatching(466)[0].should.equal(doc1._id);
                d.indexes.a.getMatching(12)[0].should.equal(doc2._id);

                d.indexes.b.tree.getNumberOfKeys().should.equal(1);
                d.indexes.b.getMatching('same').length.should.equal(2);
                d.indexes.b.getMatching('same').should.contain(doc1._id);
                d.indexes.b.getMatching('same').should.contain(doc2._id);

                // The same pointers are shared between all indexes
                d.indexes.a.tree.getNumberOfKeys().should.equal(2);
                d.indexes.b.tree.getNumberOfKeys().should.equal(1);
                d.indexes.b.getAll().length.should.equal(2);
                d.indexes._id.tree.getNumberOfKeys().should.equal(2);
                d.indexes.a.getMatching(466)[0].should.equal(d.indexes._id.getMatching(doc1._id)[0]);
                d.indexes.a.getMatching(12)[0].should.equal(d.indexes._id.getMatching(doc2._id)[0]);
                // Can't test the pointers in b as their order is randomized, but it is the same as with a

                done();
              });
            });
          });
        });
      });

      it('If a simple update violates a contraint, all changes are rolled back and an error is thrown', function (done) {
        d.ensureIndex({ fieldName: 'a', unique: true });
        d.ensureIndex({ fieldName: 'b', unique: true });
        d.ensureIndex({ fieldName: 'c', unique: true });

        d.insert({ a: 1, b: 10, c: 100 }, function (err, _doc1) {
          d.insert({ a: 2, b: 20, c: 200 }, function (err, _doc2) {
            d.insert({ a: 3, b: 30, c: 300 }, function (err, _doc3) {
              // Will conflict with doc3
              d.update({ a: 2 }, { $inc: { a: 10, c: 1000 }, $set: { b: 30 } }, {}, function (err) {
                var data = d.getAllData();
                async.map(data, d.findById.bind(d), function(er,data) {
                  var doc1 = _.find(data, function (doc) { return doc._id === _doc1._id; })
                    , doc2 = _.find(data, function (doc) { return doc._id === _doc2._id; })
                    , doc3 = _.find(data, function (doc) { return doc._id === _doc3._id; })
                    ;

                  err.errorType.should.equal('uniqueViolated');

                  // Data left unchanged
                  data.length.should.equal(3);
                  assert.deepEqual(doc1, { a: 1, b: 10, c: 100, _id: _doc1._id });
                  assert.deepEqual(doc2, { a: 2, b: 20, c: 200, _id: _doc2._id });
                  assert.deepEqual(doc3, { a: 3, b: 30, c: 300, _id: _doc3._id });

                  // All indexes left unchanged and pointing to the same docs
                  d.indexes.a.tree.getNumberOfKeys().should.equal(3);
                  d.indexes.a.getMatching(1)[0].should.equal(doc1._id);
                  d.indexes.a.getMatching(2)[0].should.equal(doc2._id);
                  d.indexes.a.getMatching(3)[0].should.equal(doc3._id);

                  d.indexes.b.tree.getNumberOfKeys().should.equal(3);
                  d.indexes.b.getMatching(10)[0].should.equal(doc1._id);
                  d.indexes.b.getMatching(20)[0].should.equal(doc2._id);
                  d.indexes.b.getMatching(30)[0].should.equal(doc3._id);

                  d.indexes.c.tree.getNumberOfKeys().should.equal(3);
                  d.indexes.c.getMatching(100)[0].should.equal(doc1._id);
                  d.indexes.c.getMatching(200)[0].should.equal(doc2._id);
                  d.indexes.c.getMatching(300)[0].should.equal(doc3._id);

                  done();
                });

              });
            });
          });
        });
      });

      it('If a multi update violates a contraint, all changes are rolled back and an error is thrown', function (done) {
        d.ensureIndex({ fieldName: 'a', unique: true });
        d.ensureIndex({ fieldName: 'b', unique: true });
        d.ensureIndex({ fieldName: 'c', unique: true });

        d.insert({ a: 1, b: 10, c: 100 }, function (err, _doc1) {
          d.insert({ a: 2, b: 20, c: 200 }, function (err, _doc2) {
            d.insert({ a: 3, b: 30, c: 300 }, function (err, _doc3) {
              // Will conflict with doc3
              d.update({ a: { $in: [1, 2] } }, { $inc: { a: 10, c: 1000 }, $set: { b: 30 } }, { multi: true }, function (err) {
                async.map(d.getAllData(), d.findById.bind(d), function(er,data) {
                  var doc1 = _.find(data, function (doc) { return doc._id === _doc1._id; })
                    , doc2 = _.find(data, function (doc) { return doc._id === _doc2._id; })
                    , doc3 = _.find(data, function (doc) { return doc._id === _doc3._id; })
                    ;

                  err.errorType.should.equal('uniqueViolated');

                  // Data left unchanged
                  data.length.should.equal(3);
                  assert.deepEqual(doc1, { a: 1, b: 10, c: 100, _id: _doc1._id });
                  assert.deepEqual(doc2, { a: 2, b: 20, c: 200, _id: _doc2._id });
                  assert.deepEqual(doc3, { a: 3, b: 30, c: 300, _id: _doc3._id });

                  // All indexes left unchanged and pointing to the same docs
                  d.indexes.a.tree.getNumberOfKeys().should.equal(3);
                  d.indexes.a.getMatching(1)[0].should.equal(doc1._id);
                  d.indexes.a.getMatching(2)[0].should.equal(doc2._id);
                  d.indexes.a.getMatching(3)[0].should.equal(doc3._id);

                  d.indexes.b.tree.getNumberOfKeys().should.equal(3);
                  d.indexes.b.getMatching(10)[0].should.equal(doc1._id);
                  d.indexes.b.getMatching(20)[0].should.equal(doc2._id);
                  d.indexes.b.getMatching(30)[0].should.equal(doc3._id);

                  d.indexes.c.tree.getNumberOfKeys().should.equal(3);
                  d.indexes.c.getMatching(100)[0].should.equal(doc1._id);
                  d.indexes.c.getMatching(200)[0].should.equal(doc2._id);
                  d.indexes.c.getMatching(300)[0].should.equal(doc3._id);

                  done();
                });               
              });
            });
          });
        });
      });

    });   // ==== End of 'Updating indexes upon document update' ==== //

    describe('Updating indexes upon document remove', function () {

      it('Removing docs still works as before with indexing', function (done) {
        d.ensureIndex({ fieldName: 'a' });

        d.insert({ a: 1, b: 'hello' }, function (err, _doc1) {
          d.insert({ a: 2, b: 'si' }, function (err, _doc2) {
            d.insert({ a: 3, b: 'coin' }, function (err, _doc3) {
              d.remove({ a: 1 }, {}, function (err, nr) {
                async.map(d.getAllData(), d.findById.bind(d), function(er,data) {
                  var doc2 = _.find(data, function (doc) { return doc._id === _doc2._id; })
                  , doc3 = _.find(data, function (doc) { return doc._id === _doc3._id; })
                  ;

                  assert.isNull(err);
                  nr.should.equal(1);

                  data.length.should.equal(2);
                  assert.deepEqual(doc2, { a: 2, b: 'si', _id: _doc2._id });
                  assert.deepEqual(doc3, { a: 3, b: 'coin', _id: _doc3._id });

                  d.remove({ a: { $in: [2, 3] } }, { multi: true }, function (err, nr) {
                    var data = d.getAllData()
                    ;

                    assert.isNull(err);
                    nr.should.equal(2);
                    data.length.should.equal(0);

                    done();
                  });
                });

              });
            });
          });
        });
      });

      it('Indexes get updated when a document (or multiple documents) is removed', function (done) {
        d.ensureIndex({ fieldName: 'a' });
        d.ensureIndex({ fieldName: 'b' });

        d.insert({ a: 1, b: 'hello' }, function (err, doc1) {
          d.insert({ a: 2, b: 'si' }, function (err, doc2) {
            d.insert({ a: 3, b: 'coin' }, function (err, doc3) {
              // Simple remove
              d.remove({ a: 1 }, {}, function (err, nr) {
                assert.isNull(err);
                nr.should.equal(1);

                d.indexes.a.tree.getNumberOfKeys().should.equal(2);
                d.indexes.a.getMatching(2)[0].should.equal(doc2._id);
                d.indexes.a.getMatching(3)[0].should.equal(doc3._id);

                d.indexes.b.tree.getNumberOfKeys().should.equal(2);
                d.indexes.b.getMatching('si')[0].should.equal(doc2._id);
                d.indexes.b.getMatching('coin')[0].should.equal(doc3._id);

                // The same pointers are shared between all indexes
                d.indexes.a.tree.getNumberOfKeys().should.equal(2);
                d.indexes.b.tree.getNumberOfKeys().should.equal(2);
                d.indexes._id.tree.getNumberOfKeys().should.equal(2);
                d.indexes.a.getMatching(2)[0].should.equal(d.indexes._id.getMatching(doc2._id)[0]);
                d.indexes.b.getMatching('si')[0].should.equal(d.indexes._id.getMatching(doc2._id)[0]);
                d.indexes.a.getMatching(3)[0].should.equal(d.indexes._id.getMatching(doc3._id)[0]);
                d.indexes.b.getMatching('coin')[0].should.equal(d.indexes._id.getMatching(doc3._id)[0]);

                // Multi remove
                d.remove({}, { multi: true }, function (err, nr) {
                  assert.isNull(err);
                  nr.should.equal(2);

                  d.indexes.a.tree.getNumberOfKeys().should.equal(0);
                  d.indexes.b.tree.getNumberOfKeys().should.equal(0);
                  d.indexes._id.tree.getNumberOfKeys().should.equal(0);

                  done();
                });
              });
            });
          });
        });
      });

    });   // ==== End of 'Updating indexes upon document remove' ==== //
    
    
    /*
    describe('Persisting indexes', function () {
    
      it('Indexes are persisted to a separate file and recreated upon reload', function (done) {
        var persDb = "workspace/persistIndexes.db"
          , db
          ;
        
        if (fs.existsSync(persDb)) { fs.writeFileSync(persDb, '', 'utf8'); }
        db = new Model({ filename: persDb, autoload: true });
        
        Object.keys(db.indexes).length.should.equal(1);
        Object.keys(db.indexes)[0].should.equal("_id");
        
        db.insert({ planet: "Earth" }, function (err) {
          assert.isNull(err);
          db.insert({ planet: "Mars" }, function (err) {
            assert.isNull(err);
            
            db.ensureIndex({ fieldName: "planet" }, function (err) {
              Object.keys(db.indexes).length.should.equal(2);
              Object.keys(db.indexes)[0].should.equal("_id");
              Object.keys(db.indexes)[1].should.equal("planet");              
              db.indexes._id.getAll().length.should.equal(2);
              db.indexes.planet.getAll().length.should.equal(2);
              db.indexes.planet.fieldName.should.equal("planet");
              
              // After a reload the indexes are recreated
              db = new Model({ filename: persDb });
              db.reload(function (err) {
                assert.isNull(err);
                Object.keys(db.indexes).length.should.equal(2);
                Object.keys(db.indexes)[0].should.equal("_id");
                Object.keys(db.indexes)[1].should.equal("planet");                
                db.indexes._id.getAll().length.should.equal(2);
                db.indexes.planet.getAll().length.should.equal(2);
                db.indexes.planet.fieldName.should.equal("planet");

                // After another reload the indexes are still there (i.e. they are preserved during autocompaction)
                db = new Model({ filename: persDb });
                db.reload(function (err) {
                  assert.isNull(err);
                  Object.keys(db.indexes).length.should.equal(2);
                  Object.keys(db.indexes)[0].should.equal("_id");
                  Object.keys(db.indexes)[1].should.equal("planet");                
                  db.indexes._id.getAll().length.should.equal(2);
                  db.indexes.planet.getAll().length.should.equal(2);
                  db.indexes.planet.fieldName.should.equal("planet");
              
                  done();                
                });
              });
            });
          });
        });
      });
    
      it('Indexes are persisted with their options and recreated even if some db operation happen between loads', function (done) {
        var persDb = "workspace/persistIndexes.db"
          , db
          ;
        
        if (fs.existsSync(persDb)) { fs.writeFileSync(persDb, '', 'utf8'); }
        db = new Model({ filename: persDb, autoload: true });
        
        Object.keys(db.indexes).length.should.equal(1);
        Object.keys(db.indexes)[0].should.equal("_id");
        
        db.insert({ planet: "Earth" }, function (err) {
          assert.isNull(err);
          db.insert({ planet: "Mars" }, function (err) {
            assert.isNull(err);
            
            db.ensureIndex({ fieldName: "planet", unique: true, sparse: false }, function (err) {
              Object.keys(db.indexes).length.should.equal(2);
              Object.keys(db.indexes)[0].should.equal("_id");
              Object.keys(db.indexes)[1].should.equal("planet");              
              db.indexes._id.getAll().length.should.equal(2);
              db.indexes.planet.getAll().length.should.equal(2);
              db.indexes.planet.unique.should.equal(true);
              db.indexes.planet.sparse.should.equal(false);
              
              db.insert({ planet: "Jupiter" }, function (err) {
                assert.isNull(err);

                // After a reload the indexes are recreated
                db = new Model({ filename: persDb });
                db.reload(function (err) {
                  assert.isNull(err);
                  Object.keys(db.indexes).length.should.equal(2);
                  Object.keys(db.indexes)[0].should.equal("_id");
                  Object.keys(db.indexes)[1].should.equal("planet");                
                  db.indexes._id.getAll().length.should.equal(3);
                  db.indexes.planet.getAll().length.should.equal(3);
                  db.indexes.planet.unique.should.equal(true);
                  db.indexes.planet.sparse.should.equal(false);
                  
                  db.ensureIndex({ fieldName: 'bloup', unique: false, sparse: true }, function (err) {
                    assert.isNull(err);
                    Object.keys(db.indexes).length.should.equal(3);
                    Object.keys(db.indexes)[0].should.equal("_id");
                    Object.keys(db.indexes)[1].should.equal("planet");
                    Object.keys(db.indexes)[2].should.equal("bloup");
                    db.indexes._id.getAll().length.should.equal(3);
                    db.indexes.planet.getAll().length.should.equal(3);
                    db.indexes.bloup.getAll().length.should.equal(0);
                    db.indexes.planet.unique.should.equal(true);
                    db.indexes.planet.sparse.should.equal(false);                  
                    db.indexes.bloup.unique.should.equal(false);
                    db.indexes.bloup.sparse.should.equal(true);                  

                    // After another reload the indexes are still there (i.e. they are preserved during autocompaction)
                    db = new Model({ filename: persDb });
                    db.reload(function (err) {
                      assert.isNull(err);
                      Object.keys(db.indexes).length.should.equal(3);
                      Object.keys(db.indexes)[0].should.equal("_id");
                      Object.keys(db.indexes)[1].should.equal("planet");
                      Object.keys(db.indexes)[2].should.equal("bloup");
                      db.indexes._id.getAll().length.should.equal(3);
                      db.indexes.planet.getAll().length.should.equal(3);
                      db.indexes.bloup.getAll().length.should.equal(0);
                      db.indexes.planet.unique.should.equal(true);
                      db.indexes.planet.sparse.should.equal(false);
                      db.indexes.bloup.unique.should.equal(false);
                      db.indexes.bloup.sparse.should.equal(true);
                  
                      done();                
                    });
                  });
                });
              });
            });
          });
        });
      });
    
      it('Indexes can also be removed and the remove persisted', function (done) {
        var persDb = "workspace/persistIndexes.db"
          , db
          ;
        
        if (fs.existsSync(persDb)) { fs.writeFileSync(persDb, '', 'utf8'); }
        db = new Model({ filename: persDb, autoload: true });
        
        Object.keys(db.indexes).length.should.equal(1);
        Object.keys(db.indexes)[0].should.equal("_id");
        
        db.insert({ planet: "Earth" }, function (err) {
          assert.isNull(err);
          db.insert({ planet: "Mars" }, function (err) {
            assert.isNull(err);
            
            db.ensureIndex({ fieldName: "planet" }, function (err) {
              assert.isNull(err);
              db.ensureIndex({ fieldName: "another" }, function (err) {
                assert.isNull(err);
                Object.keys(db.indexes).length.should.equal(3);
                Object.keys(db.indexes)[0].should.equal("_id");
                Object.keys(db.indexes)[1].should.equal("planet");
                Object.keys(db.indexes)[2].should.equal("another");
                db.indexes._id.getAll().length.should.equal(2);
                db.indexes.planet.getAll().length.should.equal(2);
                db.indexes.planet.fieldName.should.equal("planet");
                
                // After a reload the indexes are recreated
                db = new Model({ filename: persDb });
                db.reload(function (err) {
                  assert.isNull(err);
                  Object.keys(db.indexes).length.should.equal(3);
                  Object.keys(db.indexes)[0].should.equal("_id");
                  Object.keys(db.indexes)[1].should.equal("planet");  
                  Object.keys(db.indexes)[2].should.equal("another");                 
                  db.indexes._id.getAll().length.should.equal(2);
                  db.indexes.planet.getAll().length.should.equal(2);
                  db.indexes.planet.fieldName.should.equal("planet");
                  
                  // Index is removed
                  db.removeIndex("planet", function (err) {
                    assert.isNull(err);
                    Object.keys(db.indexes).length.should.equal(2);
                    Object.keys(db.indexes)[0].should.equal("_id");
                    Object.keys(db.indexes)[1].should.equal("another");
                    db.indexes._id.getAll().length.should.equal(2);

                    // After a reload indexes are preserved
                    db = new Model({ filename: persDb });
                    db.reload(function (err) {
                      assert.isNull(err);
                      Object.keys(db.indexes).length.should.equal(2);
                      Object.keys(db.indexes)[0].should.equal("_id");
                      Object.keys(db.indexes)[1].should.equal("another");
                      db.indexes._id.getAll().length.should.equal(2);
                  
                      // After another reload the indexes are still there (i.e. they are preserved during autocompaction)
                      db = new Model({ filename: persDb });
                      db.reload(function (err) {
                        assert.isNull(err);
                        Object.keys(db.indexes).length.should.equal(2);
                        Object.keys(db.indexes)[0].should.equal("_id");
                        Object.keys(db.indexes)[1].should.equal("another");
                        db.indexes._id.getAll().length.should.equal(2);
                    
                        done();                
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
      
    });   // ==== End of 'Persisting indexes' ====    
    */
  });   // ==== End of 'Using indexes' ==== //


});
