var should = require('chai').should()
  , assert = require('chai').assert
  , testDb = 'workspace/test3.db'
  , util = require('util')
  , fs = require('fs')
  , path = require('path')
  , _ = require('lodash')
  , async = require('async')
  , rimraf = require('rimraf')
  , Model = require('../lib/model')
  , Cursor = require('../lib/cursor')
  ;


describe('Schema', function () {
  var d;

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
        d = new Model("testDb", { filename: testDb });
        d.filename.should.equal(testDb);

        d.reload(function (err) {
          assert.isNull(err);
          d.getAllData().length.should.equal(0);
          return cb();
        });
      }
    ], done);
  });

  describe('Indexing', function() {
    // TODO: also check dot notation for indexes on this test
    beforeEach(function (done) {
      d = new Model("testDb", { 
        name: { index: true, unique: true, sparse: true },
        age: { index: true },
        department: { index: false },
        address: { city: { index: true } }
      }, { filename: testDb });

      d.insert([
        { age: 27, name: "Kelly", department: "support", address: { city: "Scranton" } },
        { age: 31, name: "Jim", department: "sales", address: { city: "Scranton" } },
        { age: 33, name: "Dwight", department: "sales", address: { city: "Scranton" } }, 
        { age: 45, name: "Michael", department: "management" },
        { age: 46, name: "Toby", department: "hr" },
        { age: 45, name: "Phyllis", department: "sales" },
        { age: 23, name: "Ryan", department: "sales" },

      ], function (err) {
        done();
      });
    });

    it("Create indexes specified in schema, auto-indexing does not override them", function(done) {
      assert.isDefined(d.indexes.name);
      assert.isDefined(d.indexes.age);
      assert.isUndefined(d.indexes.department);
      
      assert.isDefined(d.indexes["address.city"]);

      d.indexes.name.sparse.should.equal(true);
      d.indexes.name.unique.should.equal(true);

      d.find({ name: "Dwight" }, function(err, docs) {
        assert.isNull(err);

        docs.length.should.equal(1);
        docs[0].name.should.equal("Dwight");

        d.indexes.name.sparse.should.equal(true);
        d.indexes.name.unique.should.equal(true);

        done();
      });

      done();
    });


  });  // End of Indexing


  describe('Validation', function() {
    it("basic type validation", function(done) {
      d = new Model("testDb", { 
        name: { index: true, unique: true, sparse: true },
        age: { index: true, type: "number" },
        department: { index: false },
        address: { city: { index: true } }
      }, { filename: testDb });

      var doc = new d({ name: "Kelly", age: 27, department: "support", address: { city: "Scranon" } });
      assert.equal(doc.age, 27);
      doc.age = 28;
      (doc.age===28).should.equal(true);
      doc.age = "bullshit";
      (doc.age===28).should.equal(true);

      done();
    });

    it("type validation on constructing", function(done) {
      d = new Model("testDb", { 
        name: { index: true, unique: true, sparse: true },
        age: { index: true, type: "number" },
        department: { index: false },
        address: { city: { index: true } }
      }, { filename: testDb });

      var doc = new d({ name: "Kelly", department: "support", address: { city: "Scranon" }, age: "28" });
      (doc.age === 28).should.equal(true);
      done();
    });

    it("default value", function(done) {
      d = new Model("testDb", { 
        name: { index: true, unique: true, sparse: true },
        age: { index: true, type: "number" },
        department: { index: false },
        address: { city: { index: true } }
      }, { filename: testDb });

      var doc = new d({ name: "Kelly", department: "support", address: { city: "Scranon" } });
      (doc.age===0).should.equal(true);
      done();
    });
  }); // End of Validation
    


  describe('Model instance', function() {
    // TODO: also check dot notation for indexes on this test
    beforeEach(function (done) {
      d = new Model("testDb", { 
        name: { index: true, unique: true, sparse: true },
        age: { index: true },
        department: { index: false }
      }, { filename: testDb });

      d.insert([
        { age: 27, name: "Kelly", department: "support" },
        { age: 31, name: "Jim", department: "sales" },
        { age: 33, name: "Dwight", department: "sales" }, 
        { age: 45, name: "Michael", department: "management" },
        { age: 23, name: "Ryan", department: "sales" },

      ], function (err) {
        done();
      });
    });

    it("model instance construct", function(done) {
      var doc = new d({ name: "andy", age: 11 });
      (doc instanceof d).should.equal(true);
      
      var doc1 = new d(doc);
      (doc1 instanceof d).should.equal(true);

      done();
    });

    it("model instance .save - update object", function(done) {
      d.findOne({ name: "Dwight"}, function(err, doc) {
        doc.constructor.name.should.equal("Document");

        assert.isDefined(doc);
        doc.name.should.equal("Dwight");

        doc.name = "Dwaine";
        doc.save(function(err, doc1) {
          assert.isNull(err);
          doc1.name.should.equal("Dwaine");

          d.findOne({ _id: doc1._id }, function(err, doc2) {
            assert.isNull(err);
            doc2.name.should.equal(doc1.name);
            done();
          });

        });
      });
    });

    it("model instance .save - new object", function(done) {
      var doc = new d({ name: "Big Tuna", age: 10, department: "sales" });
      doc.save(function(err, doc1) {
        assert.isNull(err);
        assert.isDefined(doc1);

        d.findOne({ _id: doc1._id }, function(err, doc2) {
          assert.isNull(err);
          doc2.name.should.equal(doc1.name);
          done();
        });
      });

    });

    it("model instance has a working .remove", function(done) {
      d.findOne({ name: "Dwight" }, function(err,doc) {
        assert.isNull(err);
        assert.isDefined(doc);

        doc.remove(function(err) {
          assert.isNull(err);
          d.findOne({ _id: doc._id }, function(err, doc1) {
            assert.isNull(err);
            assert.isNull(doc1);

            done();
          });
        })
      });
    });

    it("model instance has a working .update", function(done) {
      d.findOne({ name: "Dwight" }, function(err,doc) {
        assert.isNull(err);
        assert.isDefined(doc);

        doc.update({ $inc: { age: 1 } }, function(err, c, doc1) {
          assert.isNull(err);
          (doc1.age == doc.age+1).should.equal(true);
          done();
        })
      });
    });



    it("Model.find returns model instance", function(done) {
      d.findOne({}, function(err, doc) {
        doc.constructor.name.should.equal("Document");
        done();
      });
    });

    it("Model.update returns model instance", function(done) {
      d.update({}, { $inc: { age: 1 } }, function(err, n, doc) {
        doc.constructor.name.should.equal("Document");
        done();
      });
    });

    it("Model.insert returns model instance", function(done) {
      d.insert({ name: "New guy" }, function(err, doc) {
        doc.constructor.name.should.equal("Document");
        done();
      });
    });
  }); // End of Model Instance

  
  // TODO: move this to db.test.js
  describe('Events', function() {
    it("use pre-action events to set _ctime and _mtime & test remove", function(done) {
      
      d.on("insert", function(doc) { doc._ctime = new Date() });
      d.on("save", function(doc) { doc._mtime = new Date() });

      new d({ name: "Jan", age: 32 }).save(function(err, doc){
        assert.isNull(err);

        util.isDate(doc._ctime).should.equal(true);
        util.isDate(doc._mtime).should.equal(true);

        setTimeout(function()  {
          doc.save(function(err, doc1) {
            d.findOne({ _id: doc1._id }, function(err,doc2) {
              assert.isNull(err);

              util.isDate(doc2._ctime).should.equal(true);
              util.isDate(doc2._mtime).should.equal(true);

              assert.isTrue(doc2._ctime.getTime() == doc._ctime.getTime());
              assert.isTrue(doc2._mtime.getTime() != doc._mtime.getTime());

              d.on("remove", function(id) { if (id == doc1._id) done() });
              doc2.remove();
            });
          });
        }, 50);

      });
    }); 


    it("test inserted/updated/removed events", function(done) {
      var doc;
      d.on("inserted", function(docs) { docs[0].name.should.equal("Jan") });
      d.on("removed", function(ids) { ids[0].should.equal(doc._id) });
      d.on("updated", function(docs) { docs[0]._id.should.equal(doc._id)  });

      new d(doc = { name: "Jan", age: 32 }).save(function(err, d){
        assert.isNull(err);
        doc = d;
        
        doc.age = 33;
        d.save(function() {
          done();
        });
      });
    });

  }); // End of Events


});


