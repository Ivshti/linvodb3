var should = require('chai').should()
  , assert = require('chai').assert
  , testDb = 'workspace/test3.db'
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
        department: { index: false }
      }, { filename: testDb });

      d.insert([
        { age: 27, name: "Kelly", department: "support" },
        { age: 31, name: "Jim", department: "sales" },
        { age: 33, name: "Dwight", department: "sales" }, 
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

  });


  describe('Validation', function() {
    it("basic type validation", function(done) {
      done(new Error("not implemented"))
    });

  });
    


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


});


