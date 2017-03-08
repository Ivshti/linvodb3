var should = require('chai').should()
  , assert = require('chai').assert
  , testDb = 'workspace/test.db'
  , fs = require('fs')
  , path = require('path')
  , _ = require('underscore')
  , async = require('async')
  , rimraf = require('rimraf')
  , Model = require('../lib/model')
  , Cursor = require('../lib/cursor')
  ;


describe('Cursor', function () {
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

  describe('Without sorting', function () {

    beforeEach(function (done) {
      d.insert({ age: 5 }, function (err) {
        d.insert({ age: 57 }, function (err) {
          d.insert({ age: 52 }, function (err) {
            d.insert({ age: 23 }, function (err) {
              d.insert({ age: 89 }, function (err) {
                return done();
              });
            });
          });
        });
      });
    });

    it('Without query, an empty query or a simple query and no skip or limit', function (done) {
      async.waterfall([
        function (cb) {
        var cursor = new Cursor(d);
        cursor.exec(function (err, docs) {
          assert.isNull(err);
          docs.length.should.equal(5);
          _.filter(docs, function(doc) { return doc.age === 5; })[0].age.should.equal(5);
          _.filter(docs, function(doc) { return doc.age === 57; })[0].age.should.equal(57);
          _.filter(docs, function(doc) { return doc.age === 52; })[0].age.should.equal(52);
          _.filter(docs, function(doc) { return doc.age === 23; })[0].age.should.equal(23);
          _.filter(docs, function(doc) { return doc.age === 89; })[0].age.should.equal(89);
          cb();
        });
      }
      , function (cb) {
        var cursor = new Cursor(d, {});
        cursor.exec(function (err, docs) {
          assert.isNull(err);
          docs.length.should.equal(5);
          _.filter(docs, function(doc) { return doc.age === 5; })[0].age.should.equal(5);
          _.filter(docs, function(doc) { return doc.age === 57; })[0].age.should.equal(57);
          _.filter(docs, function(doc) { return doc.age === 52; })[0].age.should.equal(52);
          _.filter(docs, function(doc) { return doc.age === 23; })[0].age.should.equal(23);
          _.filter(docs, function(doc) { return doc.age === 89; })[0].age.should.equal(89);
          cb();
        });
      }
      , function (cb) {
        var cursor = new Cursor(d, { age: { $gt: 23 } });
        cursor.exec(function (err, docs) {
          assert.isNull(err);
          docs.length.should.equal(3);
          _.filter(docs, function(doc) { return doc.age === 57; })[0].age.should.equal(57);
          _.filter(docs, function(doc) { return doc.age === 52; })[0].age.should.equal(52);
          _.filter(docs, function(doc) { return doc.age === 89; })[0].age.should.equal(89);
          cb();
        });
      }
      ], done);
    });

    it('With an empty collection', function (done) {
      async.waterfall([
        function (cb) {
          d.remove({}, { multi: true }, function(err) { return cb(err); })
        }
      , function (cb) {
          var cursor = new Cursor(d);
          cursor.exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(0);
            cb();
          });
        }
      ], done);
    });

    it('With a limit', function (done) {
      var cursor = new Cursor(d);
      cursor.limit(3);
      cursor.exec(function (err, docs) {
        assert.isNull(err);
        docs.length.should.equal(3);
        // No way to predict which results are returned of course ...
        done();
      });
    });

    it('With a skip', function (done) {
      var cursor = new Cursor(d);
      cursor.skip(2).exec(function (err, docs) {
        assert.isNull(err);
        docs.length.should.equal(3);
        // No way to predict which results are returned of course ...
        done();
      });
    });

    it('With a skip, testing count', function (done) {
      var cursor = new Cursor(d);
      cursor.skip(2).count(function (err, c) {
        assert.isNull(err);
        c.should.equal(3);
        done();
      });
    });

    it('With a filter', function (done) {
      var cursor = new Cursor(d);
      cursor.filter(function(x) { return x.age > 50 }).count(function (err, c) {
        assert.isNull(err);
        c.should.equal(3);
        done();
      });
    });

    it('With a filter, catch the error in the filter', function (done) {
      var cursor = new Cursor(d);
      cursor.filter(function(x) { return blablabla }).count(function (err, c) {
        assert.isDefined(err);
        assert.isUndefined(c);
        err.message.should.contain("blablabla");
        done();
      });
    });

    it('With a limit and a skip and method chaining', function (done) {
      var cursor = new Cursor(d);
      cursor.limit(4).skip(3);   // Only way to know that the right number of results was skipped is if limit + skip > number of results
      cursor.exec(function (err, docs) {
        assert.isNull(err);
        docs.length.should.equal(2);
        // No way to predict which results are returned of course ...
        done();
      });
    });

    it('With a limit and a sorter function', function (done) {
      var cursor = new Cursor(d);
      cursor.sort(function(a,b){return a.age-b.age}).limit(3);
      cursor.exec(function (err, docs) {
        assert.isNull(err);

        docs.length.should.equal(3);
        assert.deepEqual(_.pluck(docs, "age"), [5,23,52]);
        // No way to predict which results are returned of course ...
        done();
      });
    });
  });   // ===== End of 'Without sorting' =====


  describe('Sorting of the results', function () {

    beforeEach(function (done) {
      // We don't know the order in which docs wil be inserted but we ensure correctness by testing both sort orders
      d.insert({ age: 5 }, function (err) {
        d.insert({ age: 57 }, function (err) {
          d.insert({ age: 52 }, function (err) {
            d.insert({ age: 23 }, function (err) {
              d.insert({ age: 89 }, function (err) {
                return done();
              });
            });
          });
        });
      });
    });

    it('Using one sort', function (done) {
      var cursor, i;

      cursor = new Cursor(d, {});
      cursor.sort({ age: 1 });
      cursor.exec(function (err, docs) {
        assert.isNull(err);
        // Results are in ascending order
        for (i = 0; i < docs.length - 1; i += 1) {
          assert(docs[i].age < docs[i + 1].age)
        }

        cursor.sort({ age: -1 });
        cursor.exec(function (err, docs) {
          assert.isNull(err);
          // Results are in descending order
          for (i = 0; i < docs.length - 1; i += 1) {
            assert(docs[i].age > docs[i + 1].age)
          }

          done();
        });
      });
    });

    it('With an empty collection', function (done) {
      async.waterfall([
        function (cb) {
          d.remove({}, { multi: true }, function(err) { return cb(err); })
        }
      , function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 });
          cursor.exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(0);
            cb();
          });
        }
      ], done);
    });

    it('Ability to chain sorting and exec', function (done) {
      var i;
      async.waterfall([
        function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 }).exec(function (err, docs) {
            assert.isNull(err);
            // Results are in ascending order
            for (i = 0; i < docs.length - 1; i += 1) {
              assert(docs[i].age < docs[i + 1].age)
            }
            cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: -1 }).exec(function (err, docs) {
            assert.isNull(err);
            // Results are in descending order
            for (i = 0; i < docs.length - 1; i += 1) {
              assert(docs[i].age > docs[i + 1].age)
            }
            cb();
          });
        }
      ], done);
    });

    it('Using limit and sort', function (done) {
      var i;
      async.waterfall([
        function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 }).limit(3).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(3);
            docs[0].age.should.equal(5);
            docs[1].age.should.equal(23);
            docs[2].age.should.equal(52);
            cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: -1 }).limit(2).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(2);
            docs[0].age.should.equal(89);
            docs[1].age.should.equal(57);
            cb();
          });
        }
      ], done);
    });

    it('Using a limit higher than total number of docs shouldnt cause an error', function (done) {
      var i;
      async.waterfall([
        function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 }).limit(7).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(5);
            docs[0].age.should.equal(5);
            docs[1].age.should.equal(23);
            docs[2].age.should.equal(52);
            docs[3].age.should.equal(57);
            docs[4].age.should.equal(89);
            cb();
          });
        }
      ], done);
    });

    it('Using limit and skip with sort', function (done) {
      var i;
      async.waterfall([
        function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 }).limit(1).skip(2).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(1);
            docs[0].age.should.equal(52);
            cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 }).limit(3).skip(1).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(3);
            docs[0].age.should.equal(23);
            docs[1].age.should.equal(52);
            docs[2].age.should.equal(57);
            cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: -1 }).limit(2).skip(2).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(2);
            docs[0].age.should.equal(52);
            docs[1].age.should.equal(23);
            cb();
          });
        }
      ], done);
    });

    it('Using too big a limit and a skip with sort', function (done) {
      var i;
      async.waterfall([
        function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 }).limit(8).skip(2).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(3);
            docs[0].age.should.equal(52);
            docs[1].age.should.equal(57);
            docs[2].age.should.equal(89);
            cb();
          });
        }
      ], done);
    });

    it('Using too big a skip with sort should return no result', function (done) {
      var i;
      async.waterfall([
        function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 }).skip(5).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(0);
            cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 }).skip(7).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(0);
            cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 }).limit(3).skip(7).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(0);
            cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d);
          cursor.sort({ age: 1 }).limit(6).skip(7).exec(function (err, docs) {
            assert.isNull(err);
            docs.length.should.equal(0);
            cb();
          });
        }
      ], done);
    });

    it('Sorting strings', function (done) {
      async.waterfall([
        function (cb) {
          d.remove({}, { multi: true }, function (err) {
            if (err) { return cb(err); }

            d.insert({ name: 'jako'}, function () {
              d.insert({ name: 'jakeb' }, function () {
                d.insert({ name: 'sue' }, function () {
                  return cb();
                });
              });
            });
          });
        }
      , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ name: 1 }).exec(function (err, docs) {
            docs.length.should.equal(3);
            docs[0].name.should.equal('jakeb');
            docs[1].name.should.equal('jako');
            docs[2].name.should.equal('sue');
            return cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ name: -1 }).exec(function (err, docs) {
            docs.length.should.equal(3);
            docs[0].name.should.equal('sue');
            docs[1].name.should.equal('jako');
            docs[2].name.should.equal('jakeb');
            return cb();
          });
        }
      ], done);
    });

    it('Sorting nested fields with dates', function (done) {
      var doc1, doc2, doc3;

      async.waterfall([
        function (cb) {
          d.remove({}, { multi: true }, function (err) {
            if (err) { return cb(err); }

            d.insert({ event: { recorded: new Date(400) } }, function (err, _doc1) {
              doc1 = _doc1;
              d.insert({ event: { recorded: new Date(60000) } }, function (err, _doc2) {
                doc2 = _doc2;
                d.insert({ event: { recorded: new Date(32) } }, function (err, _doc3) {
                  doc3 = _doc3;
                  return cb();
                });
              });
            });
          });
        }
      , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ "event.recorded": 1 }).exec(function (err, docs) {
            docs.length.should.equal(3);
            docs[0]._id.should.equal(doc3._id);
            docs[1]._id.should.equal(doc1._id);
            docs[2]._id.should.equal(doc2._id);
            return cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ "event.recorded": -1 }).exec(function (err, docs) {
            docs.length.should.equal(3);
            docs[0]._id.should.equal(doc2._id);
            docs[1]._id.should.equal(doc1._id);
            docs[2]._id.should.equal(doc3._id);
            return cb();
          });
        }
      ], done);
    });

    it('Sorting when some fields are undefined', function (done) {
      async.waterfall([
        function (cb) {
          d.remove({}, { multi: true }, function (err) {
            if (err) { return cb(err); }

            d.insert({ name: 'jako', other: 2 }, function () {
              d.insert({ name: 'jakeb', other: 3 }, function () {
                d.insert({ name: 'sue' }, function () {
                  d.insert({ name: 'henry', other: 4 }, function () {
                    return cb();
                  });
                });
              });
            });
          });
        }
      , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ other: 1 }).exec(function (err, docs) {
            docs.length.should.equal(4);
            docs[0].name.should.equal('sue');
            assert.isUndefined(docs[0].other);
            docs[1].name.should.equal('jako');
            docs[1].other.should.equal(2);
            docs[2].name.should.equal('jakeb');
            docs[2].other.should.equal(3);
            docs[3].name.should.equal('henry');
            docs[3].other.should.equal(4);
            return cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d, { name: { $in: [ 'suzy', 'jakeb', 'jako' ] } });
          cursor.sort({ other: -1 }).exec(function (err, docs) {
            docs.length.should.equal(2);
            docs[0].name.should.equal('jakeb');
            docs[0].other.should.equal(3);
            docs[1].name.should.equal('jako');
            docs[1].other.should.equal(2);
            return cb();
          });
        }
      ], done);
    });

    it('Sorting when all fields are undefined', function (done) {
      async.waterfall([
        function (cb) {
          d.remove({}, { multi: true }, function (err) {
            if (err) { return cb(err); }

            d.insert({ name: 'jako'}, function () {
              d.insert({ name: 'jakeb' }, function () {
                d.insert({ name: 'sue' }, function () {
                  return cb();
                });
              });
            });
          });
        }
      , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ other: 1 }).exec(function (err, docs) {
            docs.length.should.equal(3);
            return cb();
          });
        }
      , function (cb) {
          var cursor = new Cursor(d, { name: { $in: [ 'sue', 'jakeb', 'jakob' ] } });
          cursor.sort({ other: -1 }).exec(function (err, docs) {
            docs.length.should.equal(2);
            return cb();
          });
        }
      ], done);
    });

    it('Multiple consecutive sorts', function(done) {
      async.waterfall([
        function (cb) {
          d.remove({}, { multi: true }, function (err) {
            if (err) { return cb(err); }

            d.insert({ name: 'jako', age: 43, nid: 1 }, function () {
              d.insert({ name: 'jakeb', age: 43, nid: 2 }, function () {
                d.insert({ name: 'sue', age: 12, nid: 3 }, function () {
                  d.insert({ name: 'zoe', age: 23, nid: 4 }, function () {
                    d.insert({ name: 'jako', age: 35, nid: 5 }, function () {
                      return cb();
                    });
                  });
                });
              });
            });
          });
        }
      , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ name: 1, age: -1 }).exec(function (err, docs) {
            docs.length.should.equal(5);

            docs[0].nid.should.equal(2);
            docs[1].nid.should.equal(1);
            docs[2].nid.should.equal(5);
            docs[3].nid.should.equal(3);
            docs[4].nid.should.equal(4);
            return cb();
          });
        }
        , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ name: 1, age: 1 }).exec(function (err, docs) {
            docs.length.should.equal(5);

            docs[0].nid.should.equal(2);
            docs[1].nid.should.equal(5);
            docs[2].nid.should.equal(1);
            docs[3].nid.should.equal(3);
            docs[4].nid.should.equal(4);
            return cb();
          });
        }
        , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ age: 1, name: 1 }).exec(function (err, docs) {
            docs.length.should.equal(5);

            docs[0].nid.should.equal(3);
            docs[1].nid.should.equal(4);
            docs[2].nid.should.equal(5);
            docs[3].nid.should.equal(2);
            docs[4].nid.should.equal(1);
            return cb();
          });
        }
        , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ age: 1, name: -1 }).exec(function (err, docs) {
            docs.length.should.equal(5);

            docs[0].nid.should.equal(3);
            docs[1].nid.should.equal(4);
            docs[2].nid.should.equal(5);
            docs[3].nid.should.equal(1);
            docs[4].nid.should.equal(2);
            return cb();
          });
        }
      ], done);    });

    it('Similar data, multiple consecutive sorts', function(done) {
      var i, j, id
        , companies = [ 'acme', 'milkman', 'zoinks' ]
        , entities = []
        ;

      async.waterfall([
        function (cb) {
          d.remove({}, { multi: true }, function (err) {
            if (err) { return cb(err); }

            id = 1;
            for (i = 0; i < companies.length; i++) {
              for (j = 5; j <= 100; j += 5) {
                entities.push({
                  company: companies[i],
                  cost: j,
                  nid: id
                });
                id++;
              }
            }

            async.each(entities, function(entity, callback) {
              d.insert(entity, function() {
                callback();
              });
            }, function(err) {
              return cb();
            });
          });
        }
      , function (cb) {
          var cursor = new Cursor(d, {});
          cursor.sort({ company: 1, cost: 1 }).exec(function (err, docs) {
            docs.length.should.equal(60);

            for (var i = 0; i < docs.length; i++) {
              docs[i].nid.should.equal(i+1);
            };
            return cb();
          });
        }
      ], done);    });

  });   // ===== End of 'Sorting' =====


  describe('Map / Reduce', function () {
    var doc1, doc2, doc3, doc4, doc0;


    beforeEach(function (done) {
      // We don't know the order in which docs wil be inserted but we ensure correctness by testing both sort orders
      d.insert({ age: 5, name: 'Jo', planet: 'B' }, function (err, _doc0) {
        doc0 = _doc0;
        d.insert({ age: 57, name: 'Louis', planet: 'R' }, function (err, _doc1) {
          doc1 = _doc1;
          d.insert({ age: 52, name: 'Grafitti', planet: 'C' }, function (err, _doc2) {
            doc2 = _doc2;
            d.insert({ age: 23, name: 'LM', planet: 'S' }, function (err, _doc3) {
              doc3 = _doc3;
              d.insert({ age: 89, planet: 'Earth' }, function (err, _doc4) {
                doc4 = _doc4;
                return done();
              });
            });
          });
        });
      });
    });

    it('basic map test', function (done) {
      var cursor = new Cursor(d, {});
      cursor.sort({ age: 1 });   // For easier finding

      cursor.map(function(x) {
        return _.pick(x, "age", "name")
      });
      cursor.exec(function (err, docs) {
        assert.isNull(err);
        docs.length.should.equal(5);
        assert.deepEqual(docs[0], { age: 5, name: 'Jo' });
        assert.deepEqual(docs[1], { age: 23, name: 'LM' });
        assert.deepEqual(docs[2], { age: 52, name: 'Grafitti' });
        assert.deepEqual(docs[3], { age: 57, name: 'Louis' });
        assert.deepEqual(docs[4], { age: 89 });   // No problems if one field to take doesn't exist

        done();
      });
    });

    it('functions are applied in order - filter, sort, (limit/skip), map, reduce', function (done) {
      var cursor = new Cursor(d, {});
      cursor.sort({ age: 1 });   // For easier finding

      cursor.filter(function(x) { return x.age < 30 });

      var mapCalled = 0;
      cursor.map(function(x, i, all) {
        mapCalled++;
        return x.age;
      });

      cursor.reduce(function(a, b) {
        return a+b;
      });

      cursor.exec(function (err, res) {
        assert.isNull(err);
        res.should.equal(28);
        mapCalled.should.equal(2);  // Make sure filter has executed when we ran map

        done();
      });
    });


    it('functions are applied in order - (filter), sort, limit/skip, map, reduce', function (done) {
      var cursor = new Cursor(d, {});
      cursor.sort({ age: 1 });   // For easier finding
      cursor.limit(2).skip(1);

      var mapCalled = 0;
      cursor.map(function(x) {
        mapCalled++;
        return x.age;
      });

      cursor.reduce(function(a, b) {
        return a+b;
      }, 5);

      cursor.exec(function (err, res) {
        assert.isNull(err);
        res.should.equal(80);

        mapCalled.should.equal(2);  // Make sure filter has executed when we ran map

        done();
      });
    });

    it('map/reduce only mode', function (done) {
      var cursor = new Cursor(d, {});

      cursor.map(function(x, i) {
        if (x.age < 30) return x.age;
        return 0;
      });

      cursor.reduce(function(a, b) {
        return a+b;
      });

      cursor.exec(function (err, res) {
        assert.isNull(err);
        res.should.equal(28);

        done();
      });
    });


    it('reduce - initial value', function (done) {
      var cursor = new Cursor(d, {});

      cursor.map(function(x, i) {
        if (x.age < 30) return x.age;
        return 0;
      });

      cursor.reduce(function(a, b) {
        return a+b;
      }, 2);

      cursor.exec(function (err, res) {
        assert.isNull(err);
        res.should.equal(30);

        done();
      });
    });



    it('aggregate', function (done) {
      var cursor = new Cursor(d, {});

      cursor.aggregate(function(res) {
        return res.length
      });

      cursor.exec(function (err, res) {
        assert.isNull(err);
        res.should.equal(5);

        done();
      });
    });
  });   // ==== End of 'Map / Reduce' ====



  describe('Streaming cursor', function () {

    var doc0,doc1,doc2,doc3,doc4;
    beforeEach(function (done) {
      // We don't know the order in which docs wil be inserted but we ensure correctness by testing both sort orders
      d.insert({ age: 5, name: 'Jo', planet: 'B' }, function (err, _doc0) {
        doc0 = _doc0;
        d.insert({ age: 57, name: 'Louis', planet: 'R' }, function (err, _doc1) {
          doc1 = _doc1;
          d.insert({ age: 52, name: 'Grafitti', planet: 'C' }, function (err, _doc2) {
            doc2 = _doc2;
            d.insert({ age: 23, name: 'LM', planet: 'S' }, function (err, _doc3) {
              doc3 = _doc3;
              d.insert({ age: 89, planet: 'Earth' }, function (err, _doc4) {
                doc4 = _doc4;
                return done();
              });
            });
          });
        });
      });
    });

    it('basic test', function (done) {
      var cursor = new Cursor(d, {});
      cursor.sort({ age: 1 });   // For easier finding

      var items  = [];
      cursor.stream(function(d) {
        items.push(d);
      }, function() {
        items.length.should.equal(5);
        done();
      });
    });

  });   // ==== End of 'Streaming cursor' ====


  describe('getMatchesStream', function() {
    // Comparison operators: $lt $lte $gt $gte $ne $in $nin $regex $exists $size
    // Logical operators: $or $and $not $where
    // We need to test all operators supported by getMatches

    /* Maybe we can reuse that dataset? */
    beforeEach(function (done) {
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

    it('events ids, data, ready fire and in the proper order', function (done) {
      var stream = Cursor.getMatchesStream(d, {});
      var ev = [];
      stream.on("ids", function() { ev.push("ids"); });
      stream.on("data", function(d) { ev.push("data"); });
      stream.on("ready", function() {
        ev.push("ready");

        assert.deepEqual(ev,["ids", "data", "data", "data", "data", "data", "data", "data", "ready"]);

        done();
      });

    });


    it('data events stop firing when stream is closed', function (done) {
      var stream = Cursor.getMatchesStream(d, {});
      var ev = [];
      stream.on("ids", function() { ev.push("ids"); });
      stream.on("data", function(d) { ev.push("data"); stream.close(); });
      stream.on("ready", function() {
        ev.push("ready");

        assert.deepEqual(ev,["ids", "data", "ready"]);

        // Run another test, this time close right after .ids
        var stream = Cursor.getMatchesStream(d, {});
        stream.on("error", function(e) { done(e) });

        ev = [];
        stream.on("ids", function() { ev.push("ids"); stream.close(); });
        stream.on("data", function(d) { ev.push("data"); });
        stream.on("ready", function() {
          ev.push("ready");

          assert.deepEqual(ev, ["ids", "ready"]);

          done();
        });
      });
    });


    it('intercept the default trigger, call it manually', function (done) {
      var stream = Cursor.getMatchesStream(d, {});
      stream.on("error", function(e) { done(e) });
      stream.removeListener("ids", stream.trigger);

      var ev = [];
      stream.on("ids", function(ids) { ev.push("ids"); stream.trigger(ids.slice(0,3)) });
      stream.on("data", function(d) { ev.push("data"); });
      stream.on("ready", function() {
        ev.push("ready");

        assert.deepEqual(ev,["ids", "data", "data", "data", "ready"]);

        done();
      });
    });


    it('lock/unlock value from the stream', function (done) {

      Cursor.getMatchesStream(d, { name: "Kelly" }).on("data", function(d1) {
        var v1 = d1.lock();
        assert.isDefined(d1.id);
        assert.isDefined(v1);
        v1.name.should.equal("Kelly");
        v1.age = 29;

        Cursor.getMatchesStream(d, { name: "Kelly" }).on("data", function(d2) {
          var v2 = d2.lock();
          v2.should.equal(v1);

          d1.unlock();
          d2.unlock();

          Cursor.getMatchesStream(d, { name: "Kelly" }).on("data", function(d3) {
            d3.lock().should.not.equal(v1);
            d3.unlock();
            done();
          });
        });

      });

    });
  });  // ===== End of 'getMatches' =====


  describe("Live query", function() {
    beforeEach(function(done) {
      d.insert([
        { age: 27, name: "Kelly", department: "support", address: { city: "Scranton" } },
        { age: 31, name: "Jim", department: "sales", address: { city: "Scranton" } },
        { age: 33, name: "Dwight", department: "sales", address: { city: "Scranton" } },
        { age: 45, name: "Michael", department: "management" },
        { age: 46, name: "Toby", department: "hr" },
        { age: 45, name: "Phyllis", department: "sales" },
        { age: 23, name: "Ryan", department: "sales" },

      ], function(err) { done() });
    });

    it("Updates properly", function(done) {
      /*
       * We do things on the dataset, expecting certain results after updating the live query
       * We test removing, inserting, updating and if modifying an object we don't care about triggers live query update
       */
      var expected = [
        [ // Default results
          { age: 33, name: "Dwight", department: "sales", address: { city: "Scranton" } },
          { age: 31, name: "Jim", department: "sales", address: { city: "Scranton" } },
          { age: 45, name: "Phyllis", department: "sales" },
          { age: 23, name: "Ryan", department: "sales" },
        ], [ // Remove Jim
          { age: 33, name: "Dwight", department: "sales", address: { city: "Scranton" } },
          { age: 45, name: "Phyllis", department: "sales" },
          { age: 23, name: "Ryan", department: "sales" },
        ], [ // Add Stanley
          { age: 33, name: "Dwight", department: "sales", address: { city: "Scranton" } },
          { age: 45, name: "Phyllis", department: "sales" },
          { age: 23, name: "Ryan", department: "sales" },
          { name: "Stanley", age: 58, department: "sales" },
        ], [ // Update Phyllis
          { age: 33, name: "Dwight", department: "sales", address: { city: "Scranton" } },
          { age: 46, name: "Phyllis", department: "sales" },
          { age: 23, name: "Ryan", department: "sales" },
          { name: "Stanley", age: 58, department: "sales" },
        ]
      ];

      var modifiers = [function() {
        d.remove({ name: "Jim" }, {}, _.noop);
      }, function() {
        d.save({ name: "Stanley", age: 58, department: "sales" }, _.noop);
      }, function() {
        d.update({ name: "Phyllis" }, { $inc: { age: 1 } }, {}, _.noop);
      }, function() { }];


      var query = d.find({ department: "sales" }).sort({ name: 1 }).live();
      d.on("liveQueryUpdate", function() {
        var exp = expected.shift(), mod = modifiers.shift();

        //console.log(query.res.map(function(x){return x.name}), exp.map(function(x){return x.name}));
        assert.deepEqual(query.res.map(function(x) { return _.omit(x, "_id") }), exp);
        mod();

        if (! expected.length) done();
      });
    });

    it("Doesn't update for no reason", function(done) {
      done = _.once(done);

      var query = d.find({ department: "sales" }).sort({ name: 1 }).live();

      var called = false;
      d.on("liveQueryUpdate", function() {
        if (called) return done(new Error("liveQueryUpdate called more than once"));
        called = true;

        query.res.length.should.equal(4);
      });

      d.once("liveQueryUpdate", function() {
        async.waterfall([function(cb) {
          d.remove({name: "Kelly"},{},function(){cb()})
        }, function(cb) {
          d.update({ name: "Michael" }, { $inc: { age: 1 } }, { },function(){cb()});
        }, function(cb) {
          d.insert({ name: "Plop", department: "service", age: 19 },function(){cb()});
        }], function() {
          setTimeout(function() { done() }, 300);
        });
      });
    });

    it("Query conditions can be changed dynamically", function(done) {
      done = _.once(done);

      var query = d.find({ department: "sales" }).sort({ name: 1 }).live();

      d.once("liveQueryUpdate", function() {
        query.res.length.should.equal(4);

        query.find({ department: "management" }).refresh();
        d.once("liveQueryUpdate", function() {
          query.res.length.should.equal(1);
          done();
        });

      });

    });

    it("Live query can be stopped", function(done) {
      done = _.once(done);

      var query = d.find({ department: "sales" }).sort({ name: 1 })
      query.should.not.to.have.ownProperty('refresh');
      query.should.not.to.have.ownProperty('stop');
      d.listeners('updated').should.to.have.length(0);
      d.listeners('inserted').should.to.have.length(0);
      d.listeners('removed').should.to.have.length(0);
      d.listeners('reload').should.to.have.length(0);
      d.listeners('liveQueryRefresh').should.to.have.length(0);

      query.live();
      query.should.to.have.ownProperty('refresh');
      query.should.to.have.ownProperty('stop');
      d.listeners('updated').should.to.have.length(1);
      d.listeners('inserted').should.to.have.length(1);
      d.listeners('removed').should.to.have.length(1);
      d.listeners('reload').should.to.have.length(1);
      d.listeners('liveQueryRefresh').should.to.have.length(1);

      query.stop();
      query.should.not.to.have.ownProperty('refresh');
      query.should.not.to.have.ownProperty('stop');
      d.listeners('updated').should.to.have.length(0);
      d.listeners('inserted').should.to.have.length(0);
      d.listeners('removed').should.to.have.length(0);
      d.listeners('reload').should.to.have.length(0);
      d.listeners('liveQueryRefresh').should.to.have.length(0);
      done();
    });

    it('Can have many live queries in one model', function (done) {
      done = _.once(done);

      var liveFind, liveCount;

      // comment one of these two to work
      liveFind = d.find({}).live();
      liveCount = d.find({}).count().live();

      d.on("liveQueryUpdate", function() {
        if (liveFind)
          liveFind.res.length.should.equal(7);

        if (liveCount)
          liveCount.res.should.equal(7);

        done();
      });
    });

  }); // End of 'Live Query'

});


