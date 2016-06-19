var document = require('../lib/document')
  , should = require('chai').should()
  , assert = require('chai').assert
  , _ = require('underscore')
  , async = require('async')
  , util = require('util')
  , fs = require('fs')
  ;


describe('Document', function () {

  describe('Serialization, deserialization', function () {

    it('Can serialize and deserialize strings', function () {
      var a, b, c;

      a = { test: "Some string" };
      b = document.serialize(a);
      c = document.deserialize(b);
      b.indexOf('\n').should.equal(-1);
      c.test.should.equal("Some string");

      // Even if a property is a string containing a new line, the serialized
      // version doesn't. The new line must still be there upon deserialization
      a = { test: "With a new\nline" };
      b = document.serialize(a);
      c = document.deserialize(b);
      c.test.should.equal("With a new\nline");
      a.test.indexOf('\n').should.not.equal(-1);
      b.indexOf('\n').should.equal(-1);
      c.test.indexOf('\n').should.not.equal(-1);
    });

    it('Can serialize and deserialize booleans', function () {
      var a, b, c;

      a = { test: true };
      b = document.serialize(a);
      c = document.deserialize(b);
      b.indexOf('\n').should.equal(-1);
      c.test.should.equal(true);
    });

    it('Can serialize and deserialize numbers', function () {
      var a, b, c;

      a = { test: 5 };
      b = document.serialize(a);
      c = document.deserialize(b);
      b.indexOf('\n').should.equal(-1);
      c.test.should.equal(5);
    });

    it('Can serialize and deserialize null', function () {
      var a, b, c;

      a = { test: null };
      b = document.serialize(a);
      c = document.deserialize(b);
      b.indexOf('\n').should.equal(-1);
      assert.isNull(a.test);
    });

    it('undefined fields are removed when serialized', function() {
      var a = { bloup: undefined, hello: 'world' }
        , b = document.serialize(a)
        , c = document.deserialize(b)
        ;

      Object.keys(c).length.should.equal(1);
      c.hello.should.equal('world');
      assert.isUndefined(c.bloup);
    });

    it('Can serialize and deserialize a date', function () {
      var a, b, c
        , d = new Date();

      a = { test: d };
      b = document.serialize(a);
      c = document.deserialize(b);
      b.indexOf('\n').should.equal(-1);
      b.should.equal('{"test":{"$$date":' + d.getTime() + '}}');
      util.isDate(c.test).should.equal(true);
      c.test.getTime().should.equal(d.getTime());
    });


    it('Can serialize and deserialize a RegExp', function () {
      var a, b, c
        , r = /test/i;

      a = { test: r };
      b = document.serialize(a);
      c = document.deserialize(b);
      b.indexOf('\n').should.equal(-1);
      b.should.equal('{"test":{"$$regex":"' + r.toString() + '"}}');
      (c.test instanceof RegExp).should.equal(true);
      c.test.toString().should.equal(r.toString());
    });

    it('Can serialize and deserialize sub objects', function () {
      var a, b, c
        , d = new Date();

      a = { test: { something: 39, also: d, yes: { again: 'yes' } } };
      b = document.serialize(a);
      c = document.deserialize(b);
      b.indexOf('\n').should.equal(-1);
      c.test.something.should.equal(39);
      c.test.also.getTime().should.equal(d.getTime());
      c.test.yes.again.should.equal('yes');
    });

    it('Can serialize and deserialize sub arrays', function () {
      var a, b, c
        , d = new Date();

      a = { test: [ 39, d, { again: 'yes' } ] };
      b = document.serialize(a);
      c = document.deserialize(b);
      b.indexOf('\n').should.equal(-1);
      c.test[0].should.equal(39);
      c.test[1].getTime().should.equal(d.getTime());
      c.test[2].again.should.equal('yes');
    });

    it('Reject field names beginning with a $ sign or containing a dot, except the four edge cases', function () {
      var a1 = { $something: 'totest' }
        , a2 = { "with.dot": 'totest' }
        , e1 = { $$date: 4321 }
        , e2 = { $$deleted: true }
        , e3 = { $$indexCreated: "indexName" }
        , e4 = { $$indexRemoved: "indexName" }
        , b;

      // Normal cases
      (function () { b = document.serialize(a1); }).should.throw();
      (function () { b = document.serialize(a2); }).should.throw();

      // Edge cases
      b = document.serialize(e1);
      b = document.serialize(e2);
      b = document.serialize(e3);
      b = document.serialize(e4);
    });
    /*
    it('Can serialize string fields with a new line without breaking the DB', function (done) {
      var db1, db2
        , badString = "world\r\nearth\nother\rline"
        ;
      
      if (fs.existsSync('workspace/test1.db')) { fs.unlinkSync('workspace/test1.db'); }
      fs.existsSync('workspace/test1.db').should.equal(false);
      db1 = new Datastore({ filename: 'workspace/test1.db' });
      
      db1.reload(function (err) {
        assert.isNull(err);
        db1.insert({ hello: badString }, function (err) {
          assert.isNull(err);
        
          db2 = new Datastore({ filename: 'workspace/test1.db' });
          db2.reload(function (err) {
            assert.isNull(err);
            db2.find({}, function (err, docs) {
              assert.isNull(err);
              docs.length.should.equal(1);
              docs[0].hello.should.equal(badString);

              done();
            });
          });
        });
      });
    });
*/

  });   // ==== End of 'Serialization, deserialization' ==== //


  describe('Object checking', function () {

    it('Field names beginning with a $ sign are forbidden', function () {
      assert.isDefined(document.checkObject);

      (function () {
        document.checkObject({ $bad: true });
      }).should.throw();

      (function () {
        document.checkObject({ some: 42, nested: { again: "no", $worse: true } });
      }).should.throw();

      // This shouldn't throw since "$actuallyok" is not a field name
      document.checkObject({ some: 42, nested: [ 5, "no", "$actuallyok", true ] });

      (function () {
        document.checkObject({ some: 42, nested: [ 5, "no", "$actuallyok", true, { $hidden: "useless" } ] });
      }).should.throw();
    });

    it('Field names cannot contain a .', function () {
      assert.isDefined(document.checkObject);

      (function () {
        document.checkObject({ "so.bad": true });
      }).should.throw();

      // Recursive behaviour testing done in the above test on $ signs
    });

    it('Properties with a null value dont trigger an error', function () {
      var obj = { prop: null };

      document.checkObject(obj);
    });
    
    it('Can check if an object is a primitive or not', function () {
      document.isPrimitiveType(5).should.equal(true);
      document.isPrimitiveType('sdsfdfs').should.equal(true);
      document.isPrimitiveType(0).should.equal(true);
      document.isPrimitiveType(true).should.equal(true);
      document.isPrimitiveType(false).should.equal(true);
      document.isPrimitiveType(new Date()).should.equal(true);
      document.isPrimitiveType([]).should.equal(true);
      document.isPrimitiveType([3, 'try']).should.equal(true);
      document.isPrimitiveType(null).should.equal(true);

      document.isPrimitiveType({}).should.equal(false);
      document.isPrimitiveType({ a: 42 }).should.equal(false);
    });

  });   // ==== End of 'Object checking' ==== //


  describe('Deep copying', function () {

    it('Should be able to deep copy any serializable document', function () {
      var d = new Date()
        , obj = { a: ['ee', 'ff', 42], date: d, subobj: { a: 'b', b: 'c' } }
        , res = document.deepCopy(obj);
        ;

      res.a.length.should.equal(3);
      res.a[0].should.equal('ee');
      res.a[1].should.equal('ff');
      res.a[2].should.equal(42);
      res.date.getTime().should.equal(d.getTime());
      res.subobj.a.should.equal('b');
      res.subobj.b.should.equal('c');

      obj.a.push('ggg');
      obj.date = 'notadate';
      obj.subobj = [];

      // Even if the original object is modified, the copied one isn't
      res.a.length.should.equal(3);
      res.a[0].should.equal('ee');
      res.a[1].should.equal('ff');
      res.a[2].should.equal(42);
      res.date.getTime().should.equal(d.getTime());
      res.subobj.a.should.equal('b');
      res.subobj.b.should.equal('c');
    });
    
    it('Should deep copy the contents of an array', function () {
      var a = [{ hello: 'world' }]
        , b = document.deepCopy(a)
        ;
        
      b[0].hello.should.equal('world');
      b[0].hello = 'another';
      b[0].hello.should.equal('another');
      a[0].hello.should.equal('world');      
    });
    
    it('Without the strictKeys option, everything gets deep copied', function () {
      var a = { a: 4, $e: 'rrr', 'eee.rt': 42, nested: { yes: 1, 'tt.yy': 2, $nopenope: 3 }, array: [{ 'rr.hh': 1 }, { yes: true }, { $yes: false }] }
        , b = document.deepCopy(a)
        ;
        
      assert.deepEqual(a, b);
    });
    
    it('With the strictKeys option, only valid keys gets deep copied', function () {
      var a = { a: 4, $e: 'rrr', 'eee.rt': 42, nested: { yes: 1, 'tt.yy': 2, $nopenope: 3 }, array: [{ 'rr.hh': 1 }, { yes: true }, { $yes: false }] }
        , b = document.deepCopy(a, true)
        ;
        
      assert.deepEqual(b, { a: 4, nested: { yes: 1 }, array: [{}, { yes: true }, {}] });
    });

  });   // ==== End of 'Deep copying' ==== //
  

  describe('Modifying documents', function () {

    it('Queries not containing any modifier just replace the document by the contents of the query but keep its _id', function () {
      var obj = { some: 'thing', _id: 'keepit' }
        , updateQuery = { replace: 'done', bloup: [ 1, 8] }
        , t
        ;

      t = document.modify(obj, updateQuery);
      t.replace.should.equal('done');
      t.bloup.length.should.equal(2);
      t.bloup[0].should.equal(1);
      t.bloup[1].should.equal(8);

      assert.isUndefined(t.some);
      t._id.should.equal('keepit');
    });

    it('Throw an error if trying to change the _id field in a copy-type modification', function () {
      var obj = { some: 'thing', _id: 'keepit' }
        , updateQuery = { replace: 'done', bloup: [ 1, 8], _id: 'donttryit' }
        ;

      (function () {
        document.modify(obj, updateQuery);
      }).should.throw();

      updateQuery._id = 'keepit';
      document.modify(obj, updateQuery);   // No error thrown
    });

    it('Throw an error if trying to use modify in a mixed copy+modify way', function () {
      var obj = { some: 'thing' }
        , updateQuery = { replace: 'me', $modify: 'metoo' };

      (function () {
        document.modify(obj, updateQuery);
      }).should.throw();
    });

    it('Throw an error if trying to use an inexistent modifier', function () {
      var obj = { some: 'thing' }
        , updateQuery = { $set: 'this exists', $modify: 'not this one' };

      (function () {
        document.modify(obj, updateQuery);
      }).should.throw();
    });

    it('Throw an error if a modifier is used with a non-object argument', function () {
      var obj = { some: 'thing' }
        , updateQuery = { $set: 'this exists' };

      (function () {
        document.modify(obj, updateQuery);
      }).should.throw();
    });

    describe('$set modifier', function () {
      it('Can change already set fields without modfifying the underlying object', function () {
        var obj = { some: 'thing', yup: 'yes', nay: 'noes' }
          , updateQuery = { $set: { some: 'changed', nay: 'yes indeed' } }
          , modified = document.modify(obj, updateQuery);

        Object.keys(modified).length.should.equal(3);
        modified.some.should.equal('changed');
        modified.yup.should.equal('yes');
        modified.nay.should.equal('yes indeed');

        Object.keys(obj).length.should.equal(3);
        obj.some.should.equal('thing');
        obj.yup.should.equal('yes');
        obj.nay.should.equal('noes');
      });

      it('Creates fields to set if they dont exist yet', function () {
        var obj = { yup: 'yes' }
          , updateQuery = { $set: { some: 'changed', nay: 'yes indeed' } }
          , modified = document.modify(obj, updateQuery);

        Object.keys(modified).length.should.equal(3);
        modified.some.should.equal('changed');
        modified.yup.should.equal('yes');
        modified.nay.should.equal('yes indeed');
      });

      it('Can set sub-fields and create them if necessary', function () {
        var obj = { yup: { subfield: 'bloup' } }
          , updateQuery = { $set: { "yup.subfield": 'changed', "yup.yop": 'yes indeed', "totally.doesnt.exist": 'now it does' } }
          , modified = document.modify(obj, updateQuery);

        _.isEqual(modified, { yup: { subfield: 'changed', yop: 'yes indeed' }, totally: { doesnt: { exist: 'now it does' } } }).should.equal(true);
      });
    });   // End of '$set modifier'
    
    describe('$unset modifier', function () {
    
      it('Can delete a field, not throwing an error if the field doesnt exist', function () {
        var obj, updateQuery, modified;
      
        obj = { yup: 'yes', other: 'also' }
        updateQuery = { $unset: { yup: true } }
        modified = document.modify(obj, updateQuery);
        assert.deepEqual(modified, { other: 'also' });

        obj = { yup: 'yes', other: 'also' }
        updateQuery = { $unset: { nope: true } }
        modified = document.modify(obj, updateQuery);
        assert.deepEqual(modified, obj);
        
        obj = { yup: 'yes', other: 'also' }
        updateQuery = { $unset: { nope: true, other: true } }
        modified = document.modify(obj, updateQuery);
        assert.deepEqual(modified, { yup: 'yes' });
      });
      
      it('Can unset sub-fields and entire nested documents', function () {
        var obj, updateQuery, modified;
      
        obj = { yup: 'yes', nested: { a: 'also', b: 'yeah' } }
        updateQuery = { $unset: { nested: true } }
        modified = document.modify(obj, updateQuery);
        assert.deepEqual(modified, { yup: 'yes' });
      
        obj = { yup: 'yes', nested: { a: 'also', b: 'yeah' } }
        updateQuery = { $unset: { 'nested.a': true } }
        modified = document.modify(obj, updateQuery);
        assert.deepEqual(modified, { yup: 'yes', nested: { b: 'yeah' } });
      
        obj = { yup: 'yes', nested: { a: 'also', b: 'yeah' } }
        updateQuery = { $unset: { 'nested.a': true, 'nested.b': true } }
        modified = document.modify(obj, updateQuery);
        assert.deepEqual(modified, { yup: 'yes', nested: {} });
      });
      
    });   // End of '$unset modifier'

    describe('$inc modifier', function () {
      it('Throw an error if you try to use it with a non-number or on a non number field', function () {
        (function () {
        var obj = { some: 'thing', yup: 'yes', nay: 2 }
          , updateQuery = { $inc: { nay: 'notanumber' } }
          , modified = document.modify(obj, updateQuery);
        }).should.throw();

        (function () {
        var obj = { some: 'thing', yup: 'yes', nay: 'nope' }
          , updateQuery = { $inc: { nay: 1 } }
          , modified = document.modify(obj, updateQuery);
        }).should.throw();
      });

      it('Can increment number fields or create and initialize them if needed', function () {
        var obj = { some: 'thing', nay: 40 }
          , modified;

        modified = document.modify(obj, { $inc: { nay: 2 } });
        _.isEqual(modified, { some: 'thing', nay: 42 }).should.equal(true);

        // Incidentally, this tests that obj was not modified
        modified = document.modify(obj, { $inc: { inexistent: -6 } });
        _.isEqual(modified, { some: 'thing', nay: 40, inexistent: -6 }).should.equal(true);
      });

      it('Works recursively', function () {
        var obj = { some: 'thing', nay: { nope: 40 } }
          , modified;

        modified = document.modify(obj, { $inc: { "nay.nope": -2, "blip.blop": 123 } });
        _.isEqual(modified, { some: 'thing', nay: { nope: 38 }, blip: { blop: 123 } }).should.equal(true);
      });
    });   // End of '$inc modifier'

    describe('$push modifier', function () {

      it('Can push an element to the end of an array', function () {
        var obj = { arr: ['hello'] }
          , modified;

        modified = document.modify(obj, { $push: { arr: 'world' } });
        assert.deepEqual(modified, { arr: ['hello', 'world'] });
      });

      it('Can push an element to a non-existent field and will create the array', function () {
        var obj = {}
          , modified;

        modified = document.modify(obj, { $push: { arr: 'world' } });
        assert.deepEqual(modified, { arr: ['world'] });
      });

      it('Can push on nested fields', function () {
        var obj = { arr: { nested: ['hello'] } }
          , modified;

        modified = document.modify(obj, { $push: { "arr.nested": 'world' } });
        assert.deepEqual(modified, { arr: { nested: ['hello', 'world'] } });

        obj = { arr: { a: 2 }};
        modified = document.modify(obj, { $push: { "arr.nested": 'world' } });
        assert.deepEqual(modified, { arr: { a: 2, nested: ['world'] } });
      });

      it('Throw if we try to push to a non-array', function () {
        var obj = { arr: 'hello' }
          , modified;

        (function () {
          modified = document.modify(obj, { $push: { arr: 'world' } });
        }).should.throw();

        obj = { arr: { nested: 45 } };
        (function () {
          modified = document.modify(obj, { $push: { "arr.nested": 'world' } });
        }).should.throw();
      });

      it('Can use the $each modifier to add multiple values to an array at once', function () {
        var obj = { arr: ['hello'] }
          , modified;

        modified = document.modify(obj, { $push: { arr: { $each: ['world', 'earth', 'everything'] } } });
        assert.deepEqual(modified, { arr: ['hello', 'world', 'earth', 'everything'] });

        (function () {
          modified = document.modify(obj, { $push: { arr: { $each: 45 } } });
        }).should.throw();

        (function () {
          modified = document.modify(obj, { $push: { arr: { $each: ['world'], unauthorized: true } } });
        }).should.throw();
      });

    });   // End of '$push modifier'

    describe('$addToSet modifier', function () {

      it('Can add an element to a set', function () {
        var obj = { arr: ['hello'] }
          , modified;

        modified = document.modify(obj, { $addToSet: { arr: 'world' } });
        assert.deepEqual(modified, { arr: ['hello', 'world'] });

        obj = { arr: ['hello'] };
        modified = document.modify(obj, { $addToSet: { arr: 'hello' } });
        assert.deepEqual(modified, { arr: ['hello'] });
      });

      it('Can add an element to a non-existent set and will create the array', function () {
        var obj = { arr: [] }
          , modified;

        modified = document.modify(obj, { $addToSet: { arr: 'world' } });
        assert.deepEqual(modified, { arr: ['world'] });
      });

      it('Throw if we try to addToSet to a non-array', function () {
        var obj = { arr: 'hello' }
          , modified;

        (function () {
          modified = document.modify(obj, { $addToSet: { arr: 'world' } });
        }).should.throw();
      });

      it('Use deep-equality to check whether we can add a value to a set', function () {
        var obj = { arr: [ { b: 2 } ] }
          , modified;

        modified = document.modify(obj, { $addToSet: { arr: { b: 3 } } });
        assert.deepEqual(modified, { arr: [{ b: 2 }, { b: 3 }] });

        obj = { arr: [ { b: 2 } ] }
        modified = document.modify(obj, { $addToSet: { arr: { b: 2 } } });
        assert.deepEqual(modified, { arr: [{ b: 2 }] });
      });

      it('Can use the $each modifier to add multiple values to a set at once', function () {
        var obj = { arr: ['hello'] }
          , modified;

        modified = document.modify(obj, { $addToSet: { arr: { $each: ['world', 'earth', 'hello', 'earth'] } } });
        assert.deepEqual(modified, { arr: ['hello', 'world', 'earth'] });

        (function () {
          modified = document.modify(obj, { $addToSet: { arr: { $each: 45 } } });
        }).should.throw();

        (function () {
          modified = document.modify(obj, { $addToSet: { arr: { $each: ['world'], unauthorized: true } } });
        }).should.throw();
      });

    });   // End of '$addToSet modifier'

    describe('$pop modifier', function () {

      it('Throw if called on a non array, a non defined field or a non integer', function () {
        var obj = { arr: 'hello' }
          , modified;

        (function () {
          modified = document.modify(obj, { $pop: { arr: 1 } });
        }).should.throw();

        obj = { bloup: 'nope' };
        (function () {
          modified = document.modify(obj, { $pop: { arr: 1 } });
        }).should.throw();

        obj = { arr: [1, 4, 8] };
        (function () {
          modified = document.modify(obj, { $pop: { arr: true } });
        }).should.throw();
      });

      it('Can remove the first and last element of an array', function () {
        var obj
          , modified;

        obj = { arr: [1, 4, 8] };
        modified = document.modify(obj, { $pop: { arr: 1 } });
        assert.deepEqual(modified, { arr: [1, 4] });

        obj = { arr: [1, 4, 8] };
        modified = document.modify(obj, { $pop: { arr: -1 } });
        assert.deepEqual(modified, { arr: [4, 8] });

        // Empty arrays are not changed
        obj = { arr: [] };
        modified = document.modify(obj, { $pop: { arr: 1 } });
        assert.deepEqual(modified, { arr: [] });
        modified = document.modify(obj, { $pop: { arr: -1 } });
        assert.deepEqual(modified, { arr: [] });
      });

    });   // End of '$pop modifier'

    describe('$pull modifier', function () {

      it('Can remove an element from a set', function () {
        var obj = { arr: ['hello', 'world'] }
          , modified;

        modified = document.modify(obj, { $pull: { arr: 'world' } });
        assert.deepEqual(modified, { arr: ['hello'] });

        obj = { arr: ['hello'] };
        modified = document.modify(obj, { $pull: { arr: 'world' } });
        assert.deepEqual(modified, { arr: ['hello'] });
      });

      it('Can remove multiple matching elements', function () {
        var obj = { arr: ['hello', 'world', 'hello', 'world'] }
          , modified;

        modified = document.modify(obj, { $pull: { arr: 'world' } });
        assert.deepEqual(modified, { arr: ['hello', 'hello'] });
      });

      it('Throw if we try to pull from a non-array', function () {
        var obj = { arr: 'hello' }
          , modified;

        (function () {
          modified = document.modify(obj, { $pull: { arr: 'world' } });
        }).should.throw();
      });

      it('Use deep-equality to check whether we can remove a value from a set', function () {
        var obj = { arr: [{ b: 2 }, { b: 3 }] }
          , modified;

        modified = document.modify(obj, { $pull: { arr: { b: 3 } } });
        assert.deepEqual(modified, { arr: [ { b: 2 } ] });

        obj = { arr: [ { b: 2 } ] }
        modified = document.modify(obj, { $pull: { arr: { b: 3 } } });
        assert.deepEqual(modified, { arr: [{ b: 2 }] });
      });
      
      it('Can use any kind of nedb query with $pull', function () {
        var obj = { arr: [4, 7, 12, 2], other: 'yup' }
          , modified
          ;
      
        modified = document.modify(obj, { $pull: { arr: { $gte: 5 } } });
        assert.deepEqual(modified, { arr: [4, 2], other: 'yup' });
        
        obj = { arr: [{ b: 4 }, { b: 7 }, { b: 1 }], other: 'yeah' };
        modified = document.modify(obj, { $pull: { arr: { b: { $gte: 5} } } });
        assert.deepEqual(modified, { arr: [{ b: 4 }, { b: 1 }], other: 'yeah' });
      });

    });   // End of '$pull modifier'

  });   // ==== End of 'Modifying documents' ==== //


  describe('Comparing things', function () {

    it('undefined is the smallest', function () {
      var otherStuff = [null, "string", "", -1, 0, 5.3, 12, true, false, new Date(12345), {}, { hello: 'world' }, [], ['quite', 5]];

      document.compareThings(undefined, undefined).should.equal(0);

      otherStuff.forEach(function (stuff) {
        document.compareThings(undefined, stuff).should.equal(-1);
        document.compareThings(stuff, undefined).should.equal(1);
      });
    });

    it('Then null', function () {
      var otherStuff = ["string", "", -1, 0, 5.3, 12, true, false, new Date(12345), {}, { hello: 'world' }, [], ['quite', 5]];

      document.compareThings(null, null).should.equal(0);

      otherStuff.forEach(function (stuff) {
        document.compareThings(null, stuff).should.equal(-1);
        document.compareThings(stuff, null).should.equal(1);
      });
    });

    it('Then numbers', function () {
      var otherStuff = ["string", "", true, false, new Date(4312), {}, { hello: 'world' }, [], ['quite', 5]]
        , numbers = [-12, 0, 12, 5.7];

      document.compareThings(-12, 0).should.equal(-1);
      document.compareThings(0, -3).should.equal(1);
      document.compareThings(5.7, 2).should.equal(1);
      document.compareThings(5.7, 12.3).should.equal(-1);
      document.compareThings(0, 0).should.equal(0);
      document.compareThings(-2.6, -2.6).should.equal(0);
      document.compareThings(5, 5).should.equal(0);

      otherStuff.forEach(function (stuff) {
        numbers.forEach(function (number) {
          document.compareThings(number, stuff).should.equal(-1);
          document.compareThings(stuff, number).should.equal(1);
        });
      });
    });

    it('Then strings', function () {
      var otherStuff = [true, false, new Date(4321), {}, { hello: 'world' }, [], ['quite', 5]]
        , strings = ['', 'string', 'hello world'];

      document.compareThings('', 'hey').should.equal(-1);
      document.compareThings('hey', '').should.equal(1);
      document.compareThings('hey', 'hew').should.equal(1);
      document.compareThings('hey', 'hey').should.equal(0);

      otherStuff.forEach(function (stuff) {
        strings.forEach(function (string) {
          document.compareThings(string, stuff).should.equal(-1);
          document.compareThings(stuff, string).should.equal(1);
        });
      });
    });

    it('Then booleans', function () {
      var otherStuff = [new Date(4321), {}, { hello: 'world' }, [], ['quite', 5]]
        , bools = [true, false];

      document.compareThings(true, true).should.equal(0);
      document.compareThings(false, false).should.equal(0);
      document.compareThings(true, false).should.equal(1);
      document.compareThings(false, true).should.equal(-1);

      otherStuff.forEach(function (stuff) {
        bools.forEach(function (bool) {
          document.compareThings(bool, stuff).should.equal(-1);
          document.compareThings(stuff, bool).should.equal(1);
        });
      });
    });

    it('Then dates', function () {
      var otherStuff = [{}, { hello: 'world' }, [], ['quite', 5]]
        , dates = [new Date(-123), new Date(), new Date(5555), new Date(0)]
        , now = new Date();

      document.compareThings(now, now).should.equal(0);
      document.compareThings(new Date(54341), now).should.equal(-1);
      document.compareThings(now, new Date(54341)).should.equal(1);
      document.compareThings(new Date(0), new Date(-54341)).should.equal(1);
      document.compareThings(new Date(123), new Date(4341)).should.equal(-1);

      otherStuff.forEach(function (stuff) {
        dates.forEach(function (date) {
          document.compareThings(date, stuff).should.equal(-1);
          document.compareThings(stuff, date).should.equal(1);
        });
      });
    });

    it('Then arrays', function () {
      var otherStuff = [{}, { hello: 'world' }]
        , arrays = [[], ['yes'], ['hello', 5]]
        ;

      document.compareThings([], []).should.equal(0);
      document.compareThings(['hello'], []).should.equal(1);
      document.compareThings([], ['hello']).should.equal(-1);
      document.compareThings(['hello'], ['hello', 'world']).should.equal(-1);
      document.compareThings(['hello', 'earth'], ['hello', 'world']).should.equal(-1);
      document.compareThings(['hello', 'zzz'], ['hello', 'world']).should.equal(1);
      document.compareThings(['hello', 'world'], ['hello', 'world']).should.equal(0);

      otherStuff.forEach(function (stuff) {
        arrays.forEach(function (array) {
          document.compareThings(array, stuff).should.equal(-1);
          document.compareThings(stuff, array).should.equal(1);
        });
      });
    });

    it('And finally objects', function () {
      document.compareThings({}, {}).should.equal(0);
      document.compareThings({ a: 42 }, { a: 312}).should.equal(-1);
      document.compareThings({ a: '42' }, { a: '312'}).should.equal(1);
      document.compareThings({ a: 42, b: 312 }, { b: 312, a: 42 }).should.equal(0);
      document.compareThings({ a: 42, b: 312, c: 54 }, { b: 313, a: 42 }).should.equal(-1);
    });

  });   // ==== End of 'Comparing things' ==== //


  describe('Querying', function () {

    describe('Comparing things', function () {

      it('Two things of different types cannot be equal, two identical native things are equal', function () {
        var toTest = [null, 'somestring', 42, true, new Date(72998322), { hello: 'world' }]
          , toTestAgainst = [null, 'somestring', 42, true, new Date(72998322), { hello: 'world' }]   // Use another array so that we don't test pointer equality
          , i, j
          ;

        for (i = 0; i < toTest.length; i += 1) {
          for (j = 0; j < toTestAgainst.length; j += 1) {
            document.areThingsEqual(toTest[i], toTestAgainst[j]).should.equal(i === j);
          }
        }
      });

      it('Can test native types null undefined string number boolean date equality', function () {
        var toTest = [null, undefined, 'somestring', 42, true, new Date(72998322), { hello: 'world' }]
          , toTestAgainst = [undefined, null, 'someotherstring', 5, false, new Date(111111), { hello: 'mars' }]
          , i
          ;

        for (i = 0; i < toTest.length; i += 1) {
          document.areThingsEqual(toTest[i], toTestAgainst[i]).should.equal(false);
        }
      });

      it('If one side is an array or undefined, comparison fails', function () {
        var toTestAgainst = [null, undefined, 'somestring', 42, true, new Date(72998322), { hello: 'world' }]
          , i
          ;

        for (i = 0; i < toTestAgainst.length; i += 1) {
          document.areThingsEqual([1, 2, 3], toTestAgainst[i]).should.equal(false);
          document.areThingsEqual(toTestAgainst[i], []).should.equal(false);

          document.areThingsEqual(undefined, toTestAgainst[i]).should.equal(false);
          document.areThingsEqual(toTestAgainst[i], undefined).should.equal(false);
        }
      });

      it('Can test objects equality', function () {
        document.areThingsEqual({ hello: 'world' }, {}).should.equal(false);
        document.areThingsEqual({ hello: 'world' }, { hello: 'mars' }).should.equal(false);
        document.areThingsEqual({ hello: 'world' }, { hello: 'world', temperature: 42 }).should.equal(false);
        document.areThingsEqual({ hello: 'world', other: { temperature: 42 }}, { hello: 'world', other: { temperature: 42 }}).should.equal(true);
      });

    });


    describe('Getting a fields value in dot notation', function () {

      it('Return first-level and nested values', function () {
        document.getDotValue({ hello: 'world' }, 'hello').should.equal('world');
        document.getDotValue({ hello: 'world', type: { planet: true, blue: true } }, 'type.planet').should.equal(true);
      });

      it('Return undefined if the field cannot be found in the object', function () {
        assert.isUndefined(document.getDotValue({ hello: 'world' }, 'helloo'));
        assert.isUndefined(document.getDotValue({ hello: 'world', type: { planet: true } }, 'type.plane'));
      });
      
      it("Can navigate inside arrays with dot notation, and return the array of values in that case", function () {
        var dv;
        
        // Simple array of subdocuments
        dv = document.getDotValue({ planets: [ { name: 'Earth', number: 3 }, { name: 'Mars', number: 2 }, { name: 'Pluton', number: 9 } ] }, 'planets.name');
        assert.deepEqual(dv, ['Earth', 'Mars', 'Pluton']);
        
        // Nested array of subdocuments
        dv = document.getDotValue({ nedb: true, data: { planets: [ { name: 'Earth', number: 3 }, { name: 'Mars', number: 2 }, { name: 'Pluton', number: 9 } ] } }, 'data.planets.number');
        assert.deepEqual(dv, [3, 2, 9]);
        
        // Nested array in a subdocument of an array (yay, inception!)
        // TODO: make sure MongoDB doesn't flatten the array (it wouldn't make sense)
        dv = document.getDotValue({ nedb: true, data: { planets: [ { name: 'Earth', numbers: [ 1, 3 ] }, { name: 'Mars', numbers: [ 7 ] }, { name: 'Pluton', numbers: [ 9, 5, 1 ] } ] } }, 'data.planets.numbers');
        assert.deepEqual(dv, [[ 1, 3 ], [ 7 ], [ 9, 5, 1 ]]);
      });
      
      it("Can get a single value out of an array using its index", function () {
        var dv;
        
        // Simple index in dot notation
        dv = document.getDotValue({ planets: [ { name: 'Earth', number: 3 }, { name: 'Mars', number: 2 }, { name: 'Pluton', number: 9 } ] }, 'planets.1');
        assert.deepEqual(dv, { name: 'Mars', number: 2 });

        // Out of bounds index
        dv = document.getDotValue({ planets: [ { name: 'Earth', number: 3 }, { name: 'Mars', number: 2 }, { name: 'Pluton', number: 9 } ] }, 'planets.3');
        assert.isUndefined(dv);

        // Index in nested array
        dv = document.getDotValue({ nedb: true, data: { planets: [ { name: 'Earth', number: 3 }, { name: 'Mars', number: 2 }, { name: 'Pluton', number: 9 } ] } }, 'data.planets.2');
        assert.deepEqual(dv, { name: 'Pluton', number: 9 });
        
        // Dot notation with index in the middle
        dv = document.getDotValue({ nedb: true, data: { planets: [ { name: 'Earth', number: 3 }, { name: 'Mars', number: 2 }, { name: 'Pluton', number: 9 } ] } }, 'data.planets.0.name');
        dv.should.equal('Earth');
      });

    });


    describe('Field equality', function () {

      it('Can find documents with simple fields', function () {
        document.match({ test: 'yeah' }, { test: 'yea' }).should.equal(false);
        document.match({ test: 'yeah' }, { test: 'yeahh' }).should.equal(false);
        document.match({ test: 'yeah' }, { test: 'yeah' }).should.equal(true);
      });

      it('Can find documents with the dot-notation', function () {
        document.match({ test: { ooo: 'yeah' } }, { "test.ooo": 'yea' }).should.equal(false);
        document.match({ test: { ooo: 'yeah' } }, { "test.oo": 'yeah' }).should.equal(false);
        document.match({ test: { ooo: 'yeah' } }, { "tst.ooo": 'yeah' }).should.equal(false);
        document.match({ test: { ooo: 'yeah' } }, { "test.ooo": 'yeah' }).should.equal(true);
      });

      it('Cannot find undefined', function () {
        document.match({ test: undefined }, { test: undefined }).should.equal(false);
        document.match({ test: { pp: undefined } }, { "test.pp": undefined }).should.equal(false);
      });

      it('Nested objects are deep-equality matched and not treated as sub-queries', function () {
        document.match({ a: { b: 5 } }, { a: { b: 5 } }).should.equal(true);
        document.match({ a: { b: 5, c: 3 } }, { a: { b: 5 } }).should.equal(false);

        document.match({ a: { b: 5 } }, { a: { b: { $lt: 10 } } }).should.equal(false);
        (function () { document.match({ a: { b: 5 } }, { a: { $or: [ { b: 10 }, { b: 5 } ] } }) }).should.throw();
      });
      
      it("Can match for field equality inside an array with the dot notation", function () {
        document.match({ a: true, b: [ 'node', 'embedded', 'database' ] }, { 'b.1': 'node' }).should.equal(false);
        document.match({ a: true, b: [ 'node', 'embedded', 'database' ] }, { 'b.1': 'embedded' }).should.equal(true);
        document.match({ a: true, b: [ 'node', 'embedded', 'database' ] }, { 'b.1': 'database' }).should.equal(false);
      })

    });


    describe('Regular expression matching', function () {

      it('Matching a non-string to a regular expression always yields false', function () {
        var d = new Date()
          , r = new RegExp(d.getTime());

        document.match({ test: true }, { test: /true/ }).should.equal(false);
        document.match({ test: null }, { test: /null/ }).should.equal(false);
        document.match({ test: 42 }, { test: /42/ }).should.equal(false);
        document.match({ test: d }, { test: r }).should.equal(false);
      });

      it('Can match strings using basic querying', function () {
        document.match({ test: 'true' }, { test: /true/ }).should.equal(true);
        document.match({ test: 'babaaaar' }, { test: /aba+r/ }).should.equal(true);
        document.match({ test: 'babaaaar' }, { test: /^aba+r/ }).should.equal(false);
        document.match({ test: 'true' }, { test: /t[ru]e/ }).should.equal(false);
      });

      it('Can match strings using the $regex operator', function () {
        document.match({ test: 'true' }, { test: { $regex: /true/ } }).should.equal(true);
        document.match({ test: 'babaaaar' }, { test: { $regex: /aba+r/ } }).should.equal(true);
        document.match({ test: 'babaaaar' }, { test: { $regex: /^aba+r/ } }).should.equal(false);
        document.match({ test: 'true' }, { test: { $regex: /t[ru]e/ } }).should.equal(false);
      });

      it('Will throw if $regex operator is used with a non regex value', function () {
        (function () {
          document.match({ test: 'true' }, { test: { $regex: 42 } })
        }).should.throw();

        (function () {
          document.match({ test: 'true' }, { test: { $regex: 'true' } })
        }).should.throw();
      });

      it('Can use the $regex operator in cunjunction with other operators', function () {
        document.match({ test: 'helLo' }, { test: { $regex: /ll/i, $nin: ['helL', 'helLop'] } }).should.equal(true);
        document.match({ test: 'helLo' }, { test: { $regex: /ll/i, $nin: ['helLo', 'helLop'] } }).should.equal(false);
      });

      it('Can use dot-notation', function () {
        document.match({ test: { nested: 'true' } }, { 'test.nested': /true/ }).should.equal(true);
        document.match({ test: { nested: 'babaaaar' } }, { 'test.nested': /^aba+r/ }).should.equal(false);

        document.match({ test: { nested: 'true' } }, { 'test.nested': { $regex: /true/ } }).should.equal(true);
        document.match({ test: { nested: 'babaaaar' } }, { 'test.nested': { $regex: /^aba+r/ } }).should.equal(false);
      });

    });


    describe('$lt', function () {

      it('Cannot compare a field to an object, an array, null or a boolean, it will return false', function () {
        document.match({ a: 5 }, { a: { $lt: { a: 6 } } }).should.equal(false);
        document.match({ a: 5 }, { a: { $lt: [6, 7] } }).should.equal(false);
        document.match({ a: 5 }, { a: { $lt: null } }).should.equal(false);
        document.match({ a: 5 }, { a: { $lt: true } }).should.equal(false);
      });

      it('Can compare numbers, with or without dot notation', function () {
        document.match({ a: 5 }, { a: { $lt: 6 } }).should.equal(true);
        document.match({ a: 5 }, { a: { $lt: 5 } }).should.equal(false);
        document.match({ a: 5 }, { a: { $lt: 4 } }).should.equal(false);

        document.match({ a: { b: 5 } }, { "a.b": { $lt: 6 } }).should.equal(true);
        document.match({ a: { b: 5 } }, { "a.b": { $lt: 3 } }).should.equal(false);
      });

      it('Can compare strings, with or without dot notation', function () {
        document.match({ a: "nedb" }, { a: { $lt: "nedc" } }).should.equal(true);
        document.match({ a: "nedb" }, { a: { $lt: "neda" } }).should.equal(false);

        document.match({ a: { b: "nedb" } }, { "a.b": { $lt: "nedc" } }).should.equal(true);
        document.match({ a: { b: "nedb" } }, { "a.b": { $lt: "neda" } }).should.equal(false);
      });

      it('If field is an array field, a match means a match on at least one element', function () {
        document.match({ a: [5, 10] }, { a: { $lt: 4 } }).should.equal(false);
        document.match({ a: [5, 10] }, { a: { $lt: 6 } }).should.equal(true);
        document.match({ a: [5, 10] }, { a: { $lt: 11 } }).should.equal(true);
      });

      it('Works with dates too', function () {
        document.match({ a: new Date(1000) }, { a: { $gte: new Date(1001) } }).should.equal(false);
        document.match({ a: new Date(1000) }, { a: { $lt: new Date(1001) } }).should.equal(true);
      });

    });


    // General behaviour is tested in the block about $lt. Here we just test operators work
    describe('Other comparison operators: $lte, $gt, $gte, $ne, $in, $exists', function () {

      it('$lte', function () {
        document.match({ a: 5 }, { a: { $lte: 6 } }).should.equal(true);
        document.match({ a: 5 }, { a: { $lte: 5 } }).should.equal(true);
        document.match({ a: 5 }, { a: { $lte: 4 } }).should.equal(false);
      });

      it('$gt', function () {
        document.match({ a: 5 }, { a: { $gt: 6 } }).should.equal(false);
        document.match({ a: 5 }, { a: { $gt: 5 } }).should.equal(false);
        document.match({ a: 5 }, { a: { $gt: 4 } }).should.equal(true);
      });

      it('$gte', function () {
        document.match({ a: 5 }, { a: { $gte: 6 } }).should.equal(false);
        document.match({ a: 5 }, { a: { $gte: 5 } }).should.equal(true);
        document.match({ a: 5 }, { a: { $gte: 4 } }).should.equal(true);
      });

      it('$ne', function () {
        document.match({ a: 5 }, { a: { $ne: 4 } }).should.equal(true);
        document.match({ a: 5 }, { a: { $ne: 5 } }).should.equal(false);
        document.match({ a: 5 }, { b: { $ne: 5 } }).should.equal(true);
        document.match({ a: false }, { a: { $ne: false } }).should.equal(false);
      });

      it('$in', function () {
        document.match({ a: 5 }, { a: { $in: [6, 8, 9] } }).should.equal(false);
        document.match({ a: 6 }, { a: { $in: [6, 8, 9] } }).should.equal(true);
        document.match({ a: 7 }, { a: { $in: [6, 8, 9] } }).should.equal(false);
        document.match({ a: 8 }, { a: { $in: [6, 8, 9] } }).should.equal(true);
        document.match({ a: 9 }, { a: { $in: [6, 8, 9] } }).should.equal(true);

        (function () { document.match({ a: 5 }, { a: { $in: 5 } }); }).should.throw();
      });

      it('$nin', function () {
        document.match({ a: 5 }, { a: { $nin: [6, 8, 9] } }).should.equal(true);
        document.match({ a: 6 }, { a: { $nin: [6, 8, 9] } }).should.equal(false);
        document.match({ a: 7 }, { a: { $nin: [6, 8, 9] } }).should.equal(true);
        document.match({ a: 8 }, { a: { $nin: [6, 8, 9] } }).should.equal(false);
        document.match({ a: 9 }, { a: { $nin: [6, 8, 9] } }).should.equal(false);

        // Matches if field doesn't exist
        document.match({ a: 9 }, { b: { $nin: [6, 8, 9] } }).should.equal(true);

        (function () { document.match({ a: 5 }, { a: { $in: 5 } }); }).should.throw();
      });

      it('$exists', function () {
        document.match({ a: 5 }, { a: { $exists: 1 } }).should.equal(true);
        document.match({ a: 5 }, { a: { $exists: true } }).should.equal(true);
        document.match({ a: 5 }, { a: { $exists: new Date() } }).should.equal(true);
        document.match({ a: 5 }, { a: { $exists: '' } }).should.equal(true);
        document.match({ a: 5 }, { a: { $exists: [] } }).should.equal(true);
        document.match({ a: 5 }, { a: { $exists: {} } }).should.equal(true);

        document.match({ a: 5 }, { a: { $exists: 0 } }).should.equal(false);
        document.match({ a: 5 }, { a: { $exists: false } }).should.equal(false);
        document.match({ a: 5 }, { a: { $exists: null } }).should.equal(false);
        document.match({ a: 5 }, { a: { $exists: undefined } }).should.equal(false);

        document.match({ a: 5 }, { b: { $exists: true } }).should.equal(false);

        document.match({ a: 5 }, { b: { $exists: false } }).should.equal(true);
      });

    });

    
    /*
    describe('Query operator array $size', function () {

        it('Can query on the size of an array field', function () {
          // Non nested documents
          document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens": { $size: 0 } }).should.equal(false);
          document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens": { $size: 1 } }).should.equal(false);
          document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens": { $size: 2 } }).should.equal(false);
          document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens": { $size: 3 } }).should.equal(true);
            
          // Nested documents
          document.match({ hello: 'world', description: { satellites: ['Moon', 'Hubble'], diameter: 6300 } }, { "description.satellites": { $size: 0 } }).should.equal(false);
          document.match({ hello: 'world', description: { satellites: ['Moon', 'Hubble'], diameter: 6300 } }, { "description.satellites": { $size: 1 } }).should.equal(false);
          document.match({ hello: 'world', description: { satellites: ['Moon', 'Hubble'], diameter: 6300 } }, { "description.satellites": { $size: 2 } }).should.equal(true);
          document.match({ hello: 'world', description: { satellites: ['Moon', 'Hubble'], diameter: 6300 } }, { "description.satellites": { $size: 3 } }).should.equal(false);

          // Using a projected array
          document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.names": { $size: 0 } }).should.equal(false);
          document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.names": { $size: 1 } }).should.equal(false);
          document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.names": { $size: 2 } }).should.equal(false);
          document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.names": { $size: 3 } }).should.equal(true);
        });

        it('$size operator works with empty arrays', function () {
          document.match({ childrens: [] }, { "childrens": { $size: 0 } }).should.equal(true);
          document.match({ childrens: [] }, { "childrens": { $size: 2 } }).should.equal(false);
          document.match({ childrens: [] }, { "childrens": { $size: 3 } }).should.equal(false);
        });

        it('Should throw an error if a query operator is used without comparing to an integer', function () {
          (function () { document.match({ a: [1, 5] }, { a: { $size: 1.4 } }); }).should.throw();
          (function () { document.match({ a: [1, 5] }, { a: { $size: 'fdf' } }); }).should.throw();
          (function () { document.match({ a: [1, 5] }, { a: { $size: { $lt: 5 } } }); }).should.throw();
        });

        it('Using $size operator on a non-array field should prevent match but not throw', function () {
          document.match({ a: 5 }, { a: { $size: 1 } }).should.equal(false);
        });
        
        it('Can use $size several times in the same matcher', function () {
          document.match({ childrens: [ 'Riri', 'Fifi', 'Loulou' ] }, { "childrens": { $size: 3, $size: 3 } }).should.equal(true);
          document.match({ childrens: [ 'Riri', 'Fifi', 'Loulou' ] }, { "childrens": { $size: 3, $size: 4 } }).should.equal(false);   // Of course this can never be true
        });
        
    });
    */
    

    describe('Logical operators $or, $and, $not', function () {

      it('Any of the subqueries should match for an $or to match', function () {
        document.match({ hello: 'world' }, { $or: [ { hello: 'pluton' }, { hello: 'world' } ] }).should.equal(true);
        document.match({ hello: 'pluton' }, { $or: [ { hello: 'pluton' }, { hello: 'world' } ] }).should.equal(true);
        document.match({ hello: 'nope' }, { $or: [ { hello: 'pluton' }, { hello: 'world' } ] }).should.equal(false);
        document.match({ hello: 'world', age: 15 }, { $or: [ { hello: 'pluton' }, { age: { $lt: 20 } } ] }).should.equal(true);
        document.match({ hello: 'world', age: 15 }, { $or: [ { hello: 'pluton' }, { age: { $lt: 10 } } ] }).should.equal(false);
      });

      it('All of the subqueries should match for an $and to match', function () {
        document.match({ hello: 'world', age: 15 }, { $and: [ { age: 15 }, { hello: 'world' } ] }).should.equal(true);
        document.match({ hello: 'world', age: 15 }, { $and: [ { age: 16 }, { hello: 'world' } ] }).should.equal(false);
        document.match({ hello: 'world', age: 15 }, { $and: [ { hello: 'world' }, { age: { $lt: 20 } } ] }).should.equal(true);
        document.match({ hello: 'world', age: 15 }, { $and: [ { hello: 'pluton' }, { age: { $lt: 20 } } ] }).should.equal(false);
      });

      it('Subquery should not match for a $not to match', function () {
        document.match({ a: 5, b: 10 }, { a: 5 }).should.equal(true);
        document.match({ a: 5, b: 10 }, { $not: { a: 5 } }).should.equal(false);
      });

      it('Logical operators are all top-level, only other logical operators can be above', function () {
        (function () { document.match({ a: { b: 7 } }, { a: { $or: [ { b: 5 }, { b: 7 } ] } })}).should.throw();
        document.match({ a: { b: 7 } }, { $or: [ { "a.b": 5 }, { "a.b": 7 } ] }).should.equal(true);
      });

      it('Logical operators can be combined as long as they are on top of the decision tree', function () {
        document.match({ a: 5, b: 7, c: 12 }, { $or: [ { $and: [ { a: 5 }, { b: 8 } ] }, { $and: [{ a: 5 }, { c : { $lt: 40 } }] } ] }).should.equal(true);
        document.match({ a: 5, b: 7, c: 12 }, { $or: [ { $and: [ { a: 5 }, { b: 8 } ] }, { $and: [{ a: 5 }, { c : { $lt: 10 } }] } ] }).should.equal(false);
      });

      it('Should throw an error if a logical operator is used without an array or if an unknown logical operator is used', function () {
        (function () { document.match({ a: 5 }, { $or: { a: 5, a: 6 } }); }).should.throw();
        (function () { document.match({ a: 5 }, { $and: { a: 5, a: 6 } }); }).should.throw();
        (function () { document.match({ a: 5 }, { $unknown: [ { a: 5 } ] }); }).should.throw();
      });

    });


    describe('Array fields', function () {

      it('Field equality', function () {
        document.match({ tags: ['node', 'js', 'db'] }, { tags: 'python' }).should.equal(false);
        document.match({ tags: ['node', 'js', 'db'] }, { tagss: 'js' }).should.equal(false);
        document.match({ tags: ['node', 'js', 'db'] }, { tags: 'js' }).should.equal(true);
        document.match({ tags: ['node', 'js', 'db'] }, { tags: 'js', tags: 'node' }).should.equal(true);

        // Mixed matching with array and non array
        document.match({ tags: ['node', 'js', 'db'], nedb: true }, { tags: 'js', nedb: true }).should.equal(true);

        // Nested matching
        document.match({ number: 5, data: { tags: ['node', 'js', 'db'] } }, { "data.tags": 'js' }).should.equal(true);
        document.match({ number: 5, data: { tags: ['node', 'js', 'db'] } }, { "data.tags": 'j' }).should.equal(false);
      });

      it('With one comparison operator', function () {
        document.match({ ages: [3, 7, 12] }, { ages: { $lt: 2 } }).should.equal(false);
        document.match({ ages: [3, 7, 12] }, { ages: { $lt: 3 } }).should.equal(false);
        document.match({ ages: [3, 7, 12] }, { ages: { $lt: 4 } }).should.equal(true);
        document.match({ ages: [3, 7, 12] }, { ages: { $lt: 8 } }).should.equal(true);
        document.match({ ages: [3, 7, 12] }, { ages: { $lt: 13 } }).should.equal(true);
      });

      it('Works with arrays that are in subdocuments', function () {
        document.match({ children: { ages: [3, 7, 12] } }, { "children.ages": { $lt: 2 } }).should.equal(false);
        document.match({ children: { ages: [3, 7, 12] } }, { "children.ages": { $lt: 3 } }).should.equal(false);
        document.match({ children: { ages: [3, 7, 12] } }, { "children.ages": { $lt: 4 } }).should.equal(true);
        document.match({ children: { ages: [3, 7, 12] } }, { "children.ages": { $lt: 8 } }).should.equal(true);
        document.match({ children: { ages: [3, 7, 12] } }, { "children.ages": { $lt: 13 } }).should.equal(true);
      });

      it('Can query inside arrays thanks to dot notation', function () {
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.age": { $lt: 2 } }).should.equal(false);
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.age": { $lt: 3 } }).should.equal(false);
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.age": { $lt: 4 } }).should.equal(true);
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.age": { $lt: 8 } }).should.equal(true);
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.age": { $lt: 13 } }).should.equal(true);
        
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.name": 'Louis' }).should.equal(false);
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.name": 'Louie' }).should.equal(true);
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.name": 'Lewi' }).should.equal(false);
      });
      
      it('Can query for a specific element inside arrays thanks to dot notation', function () {
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.0.name": 'Louie' }).should.equal(false);
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.1.name": 'Louie' }).should.equal(false);
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.2.name": 'Louie' }).should.equal(true);
        document.match({ childrens: [ { name: "Huey", age: 3 }, { name: "Dewey", age: 7 }, { name: "Louie", age: 12 } ] }, { "childrens.3.name": 'Louie' }).should.equal(false);
      });
      
      /*
      it('A single array-specific operator and the query is treated as array specific', function () {
        (function () { document.match({ childrens: [ 'Riri', 'Fifi', 'Loulou' ] }, { "childrens": { "Fifi": true, $size: 3 } })}).should.throw();
      });
      
      it('Can mix queries on array fields and non array filds with array specific operators', function () {
        document.match({ uncle: 'Donald', nephews: [ 'Riri', 'Fifi', 'Loulou' ] }, { nephews: { $size: 2 }, uncle: 'Donald' }).should.equal(false);
        document.match({ uncle: 'Donald', nephews: [ 'Riri', 'Fifi', 'Loulou' ] }, { nephews: { $size: 3 }, uncle: 'Donald' }).should.equal(true);
        document.match({ uncle: 'Donald', nephews: [ 'Riri', 'Fifi', 'Loulou' ] }, { nephews: { $size: 4 }, uncle: 'Donald' }).should.equal(false);

        document.match({ uncle: 'Donals', nephews: [ 'Riri', 'Fifi', 'Loulou' ] }, { nephews: { $size: 3 }, uncle: 'Picsou' }).should.equal(false);
        document.match({ uncle: 'Donald', nephews: [ 'Riri', 'Fifi', 'Loulou' ] }, { nephews: { $size: 3 }, uncle: 'Donald' }).should.equal(true);
        document.match({ uncle: 'Donald', nephews: [ 'Riri', 'Fifi', 'Loulou' ] }, { nephews: { $size: 3 }, uncle: 'Daisy' }).should.equal(false);
      });
      */
    });

  });   // ==== End of 'Querying' ==== //

});
