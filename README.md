LinvoDB
=========

LinvoDB is a Node.js/NW.js/Electron persistent DB with MongoDB / Mongoose-like features and interface.

### Features:

* **MongoDB-like query language**
* **Persistence** built on LevelUP - you can **pick back-end**
* **NW.js/Electron friendly** - JS-only backend is [level-js](https://www.npmjs.com/package/level-js) or [Medea](https://github.com/medea/medea)
* **Performant** - steady performance unaffected by DB size - queries are always indexed
* **Auto-indexing**
* **Live queries** - make the query, get constantly up-to-date results
* **Schemas** - built-in schema support
* **Efficient Map / Reduce / Limit**

### Coming soon:

* **Streaming cursors**
* **Distributed dataset**


Relationship to NeDB
--------------------
LinvoDB is based on NeDB, the most significant core change is that it uses LevelUP as a back-end, meaning it doesn't have to keep the whole dataset in memory. LinvoDB also can do a query entirely by indexes, meaning it doesn't have to scan the full database on a query. 

In general:

* LinvoDB is better for large datasets (many objects, or large objects) because it doesn't keep the whole DB in memory and doesn't need to always scan it
* LinvoDB does the entire query through the indexes, NeDB scans the DB
* Both LinvoDB and NeDB play well with NW.js (node-webkit). LinvoDB can be initialized with the JS-only level-js back-end.
* NeDB is ultra-fast because the DB is in memory, LinvoDB's performance is comparible to MongoDB. LinvoDB is faster for large datasets.
* LinvoDB has live queries, map/reduce and schema support.
* Both LinvoDB and NeDB are unsuitable for huge datasets (big data)
* Combining NeDB's in-memory data and LinvoDB's full-indexed queries would yield even better performance. If you want to sacrifice memory for query performance, you can use LinvoDB with a backend that works like that or with LevelDB + increased LRU cache


Install, Initialize, pick backend
-------------------------

Install:
```javascript
npm install linvodb3 level-js # For NW.js, using level-js
npm install linvodb3 leveldown # For pure node.js, using LevelDB
```

Initialize:
```javascript
var LinvoDB = require("linvodb3");

// The following two lines are very important
// Initialize the default store to level-js - which is a JS-only store which will work without recompiling in NW.js / Electron
LinvoDB.defaults.store = { db: require("level-js") }; // Comment out to use LevelDB instead of level-js
// Set dbPath - this should be done explicitly and will be the dir where each model's store is saved
LinvoDB.dbPath = process.cwd(); 

var Doc = new LinvoDB("doc", { /* schema, can be empty */ })
```

Initialization, detailed:
```javascript
var LinvoDB = require("linvodb3");
var modelName = "doc";
var schema = { }; // Non-strict always, can be left empty
var options = { };
// options.filename = "./test.db"; // Path to database - not necessary 
// options.store = { db: require("level-js") }; // Options passed to LevelUP constructor 
var Doc = new LinvoDB(modelName, schema, options); // New model; Doc is the constructor

LinvoDB.dbPath // default path where data files are stored for each model
LinvoDB.defaults // default options for every model
```

Insert / Save
-------------
The native types are `String`, `Number`, `Boolean`, `Date` and `null`. You can also use
arrays and subdocuments (objects). If a field is `undefined`, it will not be saved.  

If the document does not contain an `_id` field, one will be automatically generated (a 16-characters alphanumerical string). The `_id` of a document, once set, cannot be modified.

```javascript
// Construct a single document and then save it
var doc = new Doc({ a: 5, now: new Date(), test: "this is a string" });
doc.b = 13; // you can modify the doc 
doc.save(function(err) { 
	// Document is saved
	console.log(doc._id);
});

// Insert document(s)
// you can use the .insert method to insert one or more documents
Doc.insert({ a: 3 }, function (err, newDoc) {
	console.log(newDoc._id);
});
Doc.insert([{ a: 3 }, { a: 42 }], function (err, newDocs) {
	// Two documents were inserted in the database
	// newDocs is an array with these documents, augmented with their _id

	// If there's an unique constraint on 'a', this will fail, and no changes will be made to the DB
	// err is a 'uniqueViolated' error
});

// Save document(s)
// save is like an insert, except it allows saving existing document too
Doc.save([ doc, { a: 55, test: ".save is handy" } ], function(err, docs) { 
	// docs[0] is doc
	// docs[1] is newly-inserted document with a=55 and has an assigned _id

	// Doing that with .insert would throw an uniqueViolated error for _id on doc, because it assumes all documents are new
});
```

Querying
------------------------
Use `find` to look for multiple documents matching you query, or `findOne` to look for one specific document. You can select documents based on field equality or use comparison operators (`$lt`, `$lte`, `$gt`, `$gte`, `$in`, `$nin`, `$ne`, `$regex`, `$exists`). You can also use logical operators `$or`, `$and` and `$not`. See below for the syntax.

```javascript
var Planet = new LinvoDB("planet", { /* schema, can be empty */ })

// Let's say our datastore contains the following collection
Planet.save([ 
	{ _id: 'id1', planet: 'Mars', system: 'solar', inhabited: false, satellites: ['Phobos', 'Deimos'] },
	{ _id: 'id2', planet: 'Earth', system: 'solar', inhabited: true, humans: { genders: 2, eyes: true } },
	{ _id: 'id3', planet: 'Jupiter', system: 'solar', inhabited: false },
	{ _id: 'id4', planet: 'Omicron Persei 8', system: 'futurama', inhabited: true, humans: { genders: 7 } },
	{ _id: 'id5', completeData: { planets: [ { name: 'Earth', number: 3 }, { name: 'Mars', number: 2 }, { name: 'Pluton', number: 9 } ] } }
], function() { 

// Finding all planets in the solar system
Planet.find({ system: 'solar' }, function (err, docs) {
  // docs is an array containing documents Mars, Earth, Jupiter
  // If no document is found, docs is equal to []
});

// Finding all inhabited planets in the solar system
Planet.find({ system: 'solar', inhabited: true }, function (err, docs) {
  // docs is an array containing document Earth only
});

// Use the dot-notation to match fields in subdocuments
Planet.find({ "humans.genders": 2 }, function (err, docs) {
  // docs contains Earth
});

// Use the dot-notation to navigate arrays of subdocuments
Planet.find({ "completeData.planets.name": "Mars" }, function (err, docs) {
  // docs contains document 5
});

Planet.find({ "completeData.planets.0.name": "Earth" }, function (err, docs) {
  // docs contains document 5
  // If we had tested against "Mars" docs would be empty because we are matching against a specific array element
});

// You can also deep-compare objects. Don't confuse this with dot-notation!
Planet.find({ humans: { genders: 2 } }, function (err, docs) {
  // docs is empty, because { genders: 2 } is not equal to { genders: 2, eyes: true }
});

// Find all documents in the collection
Planet.find({}, function (err, docs) {
});

// The same rules apply when you want to only find one document
Planet.findOne({ _id: 'id1' }, function (err, doc) {
  // doc is the document Mars
  // If no document is found, doc is null
});


}); // end of .save()
```
#### Operators ($lt, $lte, $gt, $gte, $in, $nin, $ne, $exists, $regex)
The syntax is `{ field: { $op: value } }` where `$op` is any comparison operator:  

* `$lt`, `$lte`: less than, less than or equal
* `$gt`, `$gte`: greater than, greater than or equal
* `$in`: member of. `value` must be an array of values
* `$ne`, `$nin`: not equal, not a member of
* `$exists`: checks whether the document posses the property `field`. `value` should be true or false
* `$regex`: checks whether a string is matched by the regular expression. Contrary to MongoDB, the use of `$options` with `$regex` is not supported, because it doesn't give you more power than regex flags. Basic queries are more readable so only use the `$regex` operator when you need to use another operator with it (see example below)

```javascript
// $lt, $lte, $gt and $gte work on numbers and strings
Planet.find({ "humans.genders": { $gt: 5 } }, function (err, docs) {
  // docs contains Omicron Persei 8, whose humans have more than 5 genders (7).
});

// When used with strings, lexicographical order is used
Planet.find({ planet: { $gt: 'Mercury' }}, function (err, docs) {
  // docs contains Omicron Persei 8
})

// Using $in. $nin is used in the same way
Planet.find({ planet: { $in: ['Earth', 'Jupiter'] }}, function (err, docs) {
  // docs contains Earth and Jupiter
});

// Using $exists
Planet.find({ satellites: { $exists: true } }, function (err, docs) {
  // docs contains only Mars
});

// Using $regex with another operator
Planet.find({ planet: { $regex: /ar/, $nin: ['Jupiter', 'Earth'] } }, function (err, docs) {
  // docs only contains Mars because Earth was excluded from the match by $nin
});
```

#### Array fields
When a field in a document is an array the query is treated as a query on every element and there is a match if at least one element matches.

```javascript
// If a document's field is an array, matching it means matching any element of the array
Planet.find({ satellites: 'Phobos' }, function (err, docs) {
  // docs contains Mars. Result would have been the same if query had been { satellites: 'Deimos' }
});

// This also works for queries that use comparison operators
Planet.find({ satellites: { $lt: 'Amos' } }, function (err, docs) {
  // docs is empty since Phobos and Deimos are after Amos in lexicographical order
});

// This also works with the $in and $nin operator
Planet.find({ satellites: { $in: ['Moon', 'Deimos'] } }, function (err, docs) {
  // docs contains Mars (the Earth document is not complete!)
});
```

#### Logical operators $or, $and, $not
You can combine queries using logical operators:  

* For `$or` and `$and`, the syntax is `{ $op: [query1, query2, ...] }`.
* For `$not`, the syntax is `{ $not: query }`

```javascript
Planet.find({ $or: [{ planet: 'Earth' }, { planet: 'Mars' }] }, function (err, docs) {
  // docs contains Earth and Mars
});

Planet.find({ $not: { planet: 'Earth' } }, function (err, docs) {
  // docs contains Mars, Jupiter, Omicron Persei 8
});

// You can mix normal queries, comparison queries and logical operators
Planet.find({ $or: [{ planet: 'Earth' }, { planet: 'Mars' }], inhabited: true }, function (err, docs) {
  // docs contains Earth
});
```

#### Sorting and paginating
If you don't specify a callback to `find`, `findOne` or `count`, a `Cursor` object is returned. You can modify the cursor with `sort`, `skip` and `limit` and then execute it with `exec(callback)`.

```javascript
var Planet = new LinvoDB("planet", { /* schema, can be empty */ })

var doc1,doc2,doc3,doc4;

Planet.save([
	doc1 = { _id: 'id1', planet: 'Mars', system: 'solar', inhabited: false, satellites: ['Phobos', 'Deimos'] },
	doc2 = { _id: 'id2', planet: 'Earth', system: 'solar', inhabited: true, humans: { genders: 2, eyes: true } },
	doc3 = { _id: 'id3', planet: 'Jupiter', system: 'solar', inhabited: false },
	doc4 = { _id: 'id4', planet: 'Omicron Persei 8', system: 'futurama', inhabited: true, humans: { genders: 7 } }
], function() { 

// No query used means all results are returned (before the Cursor modifiers)
Planet.find({}).sort({ planet: 1 }).skip(1).limit(2).exec(function (err, docs) {
  // docs is [doc3, doc1]
});

// You can sort in reverse order like this
Planet.find({ system: 'solar' }).sort({ planet: -1 }).exec(function (err, docs) {
  // docs is [doc1, doc3, doc2]
});

// You can sort on one field, then another, and so on like this:
Planet.find({}).sort({ firstField: 1, secondField: -1 }) ...   // You understand how this works!

}); // end of .save
```

### Counting documents
You can use `count` to count documents. It has the same syntax as `find`. For example:

```javascript
// Count all planets in the solar system
Planet.count({ system: 'solar' }, function (err, count) {
  // count equals to 3
});

// Count all documents via cursor
Planet.find({}).count(function (err, count) {
  // count equals to 4
});
```


Map / Reduce / Filter / Aggregate
------------
Besides the standard pagination and sorting Cursor methods, we have the `filter`, `map` and `reduce` modifiers.	
Before seeing the examples, you should know that **you can combine any of these modifiers in any order/way and all will be executed**. For example, you can run a regular query with .find and then run a reduce on it. 
No matter how you combine those modifiers, the order of execution is: *query, filter, sort, limit/skip, map, reduce, aggregate*.

The basic syntax is:

`Cursor.map(function(val){ return val })`

`Cursor.reduce(function reducer(a,b), initial);`

`Cursor.filter(function(val) { return true /* or false*/ }); // truthy / falsy values accepted`

`Cursor.aggregate(function(res) { /* do something to the result of the query right before serving */ return res })`

```javascript
// Let's assume this dataset
var Planet = new LinvoDB("planet", { /* schema, can be empty */ })
Planet.save([
	doc1 = { _id: 'id1', planet: 'Mars', system: 'solar', inhabited: false, satellites: ['Phobos', 'Deimos'] },
	doc2 = { _id: 'id2', planet: 'Earth', system: 'solar', inhabited: true, humans: { genders: 2, eyes: true } },
	doc3 = { _id: 'id3', planet: 'Jupiter', system: 'solar', inhabited: false },
	doc4 = { _id: 'id4', planet: 'Omicron Persei 8', system: 'futurama', inhabited: true, humans: { genders: 7 } }
], function() { 

// Map/reduce capabilities
Planet.find({ system: 'solar' }).sort({ planet: 1 })
.map(function(x) { return x.planet })
.reduce(function(a, b) { return a+", "+b }, "")
.exec(function(err, res) { 
	// res is "Earth, Jupiter, Mars"
});

// The largest number of human genders
Planet.find({ "humans.genders": { $exists: true } })
.map(function(x) { return x.humans.genders })
.reduce(function(a,b) { return Math.max(a,b) }, 0)
.exec(function(err,res) { 
	// res is 7
});

// Combine map and filter only
// As you can see, you can use map if you want to project only a part of the data
Planet.find({})
.filter(function(x){ return x.planet.length > 5 })
.map(function(x){ return { planet: x.planet } })
.exec(function(err,res) { 
	// res is [{ planet: 'Jupiter' }, { planet: 'Omicron Persei 8' }]
});

// Use aggregate to emulate count
Planet.find({}).aggregate(function(res){ return res.length }).exec(function(err,res) { 
	// res is 4
});

// Combine all the methods, because we can
Planet.find({ system: "solar" }) // we have Mars, Earth, Jupiter remaining
.sort({ inhabited: 1 })
.limit(2) // Earth falls out, we have Mars, Jupiter
.filter(function(x){ return x.planet.length > 5 }) // only Jupiter remains
.map(function(x) { return x.planet })
.reduce(function(a,b) { return a+" "+b }, "planets are:")
.aggregate(function(res) { return res+", those are uninhabited and in the solar system, with a long name" })
.exec(function(err,res){ console.log(res) }); // "planets are: Jupiter, those are uninhabited and in the solar system, with a long name"

}); // end .save()
```

Live Queries
-----------------
Once you have a `Cursor` object, returned by calling `find` without a callback, you can turn it into a live query, meaning the `.res` property will always be up-to-date results from the query. Of course, all modifiers, such as `limit`, `skip`, `sort`, `map`, `reduce`, `filter` and `aggregate` will still apply.

An event will be emitted when the result is updated - `liveQueryUpdate` on the model itself.

**Seriously consider if live queries can be utilized in your application** - if you need particular results continuously, using live queries is extremely efficient, since you don't have to re-read the database but results are kept up-to-date as you update the documents. 

```javascript
// Let's assume this dataset
var Planet = new LinvoDB("planet", { /* schema, can be empty */ })
Planet.save([
	{ _id: 'id1', planet: 'Mars', system: 'solar', inhabited: false, satellites: ['Phobos', 'Deimos'] },
	{ _id: 'id2', planet: 'Earth', system: 'solar', inhabited: true, humans: { genders: 2, eyes: true } },
	{ _id: 'id3', planet: 'Jupiter', system: 'solar', inhabited: false },
	{ _id: 'id4', planet: 'Omicron Persei 8', system: 'futurama', inhabited: true, humans: { genders: 7 } }
], function(err, docs) { 

var live = Planet.find({ system: "solar" }).sort({ inhabited: -1 }).limit(2).live(); // don't forget you can still use map, reduce, filter, aggregate

Planet.on("liveQueryUpdate", function() { 
	// we'll log this twice, once on the initial result and then again once we update document
	// we won't get this emitted if we modify the dataset with documents that do not fit the query ({ system: solar })
	console.log(live.res);
});

setTimeout(function() {
	docs[1].inhabited = false; // Earth catastrophe 
	docs[1].save(); // Save Earth
}, 666);

}); // end .save()
```

### Angular Disclaimer
If you plan to use **Live Queries with AngularJS** and update scope on the `liveQueryUpdated` event please be careful. First, I recommend using `$digest` when possible instead of `$apply` (dirty-check only the current scope). Second, I recommend debouncing the event before running the `$scope.$apply()` event to avoid $apply being called many times because of heavy DB use at a moment.


Updating
--------------

### Re-saving a document
`doc.save()` - you can use `save` on a document instance to re-save it, therefore updating it.
```javascript
// Let's use the same example collection as in the "finding document" part
// { _id: 'id1', planet: 'Mars', system: 'solar', inhabited: false }
// { _id: 'id2', planet: 'Earth', system: 'solar', inhabited: true }
// { _id: 'id3', planet: 'Jupiter', system: 'solar', inhabited: false }
// { _id: 'id4', planet: 'Omicron Persia 8', system: 'futurama', inhabited: true }

Planet.findOne({ planet: 'Earth' }, function(err, doc) {
	doc.inhabited = false;
	doc.save(function(err) { /* we have updated the Earth doc */ }); 
});
```

### Atomic updating
`Doc.update(query, update, options, callback)` will update all documents matching `query` according to the `update` rules:  
* `query` is the same kind of finding query you use with `find` and `findOne`
* `update` specifies how the documents should be modified. It is either a new document or a set of modifiers (you cannot use both together, it doesn't make sense!)
  * A new document will replace the matched docs
  * The modifiers create the fields they need to modify if they don't exist, and you can apply them to subdocs. Available field modifiers are `$set` to change a field's value, `$unset` to delete a field and `$inc` to increment a field's value. To work on arrays, you have `$push`, `$pop`, `$addToSet`, `$pull`, and the special `$each`. See examples below for the syntax.
* `options` is an object with two possible parameters
  * `multi` (defaults to `false`) which allows the modification of several documents if set to true
  * `upsert` (defaults to `false`) if you want to insert a new document corresponding to the `update` rules if your `query` doesn't match anything. If your `update` is a simple object with no modifiers, it is the inserted document. In the other case, the `query` is stripped from all operator recursively, and the `update` is applied to it.
* `callback` (optional) signature: `err`, `numReplaced`, `newDoc`
  * `numReplaced` is the number of documents replaced
  * `newDoc` is the created document if the upsert mode was chosen and a document was inserted

**Note**: you can't change a document's _id.

```javascript
// Let's use the same example collection as in the "finding document" part
// { _id: 'id1', planet: 'Mars', system: 'solar', inhabited: false }
// { _id: 'id2', planet: 'Earth', system: 'solar', inhabited: true }
// { _id: 'id3', planet: 'Jupiter', system: 'solar', inhabited: false }
// { _id: 'id4', planet: 'Omicron Persia 8', system: 'futurama', inhabited: true }

// Replace a document by another
Planet.update({ planet: 'Jupiter' }, { planet: 'Pluton'}, {}, function (err, numReplaced) {
  // numReplaced = 1
  // The doc #3 has been replaced by { _id: 'id3', planet: 'Pluton' }
  // Note that the _id is kept unchanged, and the document has been replaced
  // (the 'system' and inhabited fields are not here anymore)
});

// Set an existing field's value
Planet.update({ system: 'solar' }, { $set: { system: 'solar system' } }, { multi: true }, function (err, numReplaced) {
  // numReplaced = 3
  // Field 'system' on Mars, Earth, Jupiter now has value 'solar system'
});

// Setting the value of a non-existing field in a subdocument by using the dot-notation
Planet.update({ planet: 'Mars' }, { $set: { "data.satellites": 2, "data.red": true } }, {}, function () {
  // Mars document now is { _id: 'id1', system: 'solar', inhabited: false
  //                      , data: { satellites: 2, red: true }
  //                      }
  // Not that to set fields in subdocuments, you HAVE to use dot-notation
  // Using object-notation will just replace the top-level field
  Planet.update({ planet: 'Mars' }, { $set: { data: { satellites: 3 } } }, {}, function () {
    // Mars document now is { _id: 'id1', system: 'solar', inhabited: false
    //                      , data: { satellites: 3 }
    //                      }
    // You lost the "data.red" field which is probably not the intended behavior
  });
});

// Deleting a field
Planet.update({ planet: 'Mars' }, { $unset: { planet: true } }, {}, function () {
  // Now the document for Mars doesn't contain the planet field
  // You can unset nested fields with the dot notation of course
});

// Upserting a document
Planet.update({ planet: 'Pluton' }, { planet: 'Pluton', inhabited: false }, { upsert: true }, function (err, numReplaced, upsert) {
  // numReplaced = 1, upsert = { _id: 'id5', planet: 'Pluton', inhabited: false }
  // A new document { _id: 'id5', planet: 'Pluton', inhabited: false } has been added to the collection
});

// If you upsert with a modifier, the upserted doc is the query modified by the modifier
// This is simpler than it sounds :)
Planet.update({ planet: 'Pluton' }, { $inc: { distance: 38 } }, { upsert: true }, function () {
  // A new document { _id: 'id5', planet: 'Pluton', distance: 38 } has been added to the collection  
});

// If we insert a new document { _id: 'id6', fruits: ['apple', 'orange', 'pear'] } in the collection,
// let's see how we can modify the array field atomically

// $push inserts new elements at the end of the array
Planet.update({ _id: 'id6' }, { $push: { fruits: 'banana' } }, {}, function () {
  // Now the fruits array is ['apple', 'orange', 'pear', 'banana']
});

// $pop removes an element from the end (if used with 1) or the front (if used with -1) of the array
Planet.update({ _id: 'id6' }, { $pop: { fruits: 1 } }, {}, function () {
  // Now the fruits array is ['apple', 'orange']
  // With { $pop: { fruits: -1 } }, it would have been ['orange', 'pear']
});

// $addToSet adds an element to an array only if it isn't already in it
// Equality is deep-checked (i.e. $addToSet will not insert an object in an array already containing the same object)
// Note that it doesn't check whether the array contained duplicates before or not
Planet.update({ _id: 'id6' }, { $addToSet: { fruits: 'apple' } }, {}, function () {
  // The fruits array didn't change
  // If we had used a fruit not in the array, e.g. 'banana', it would have been added to the array
});

// $pull removes all values matching a value or even any query from the array
Planet.update({ _id: 'id6' }, { $pull: { fruits: 'apple' } }, {}, function () {
  // Now the fruits array is ['orange', 'pear']
});
Planet.update({ _id: 'id6' }, { $pull: { fruits: $in: ['apple', 'pear'] } }, {}, function () {
  // Now the fruits array is ['orange']
});



// $each can be used to $push or $addToSet multiple values at once
// This example works the same way with $addToSet
Planet.update({ _id: 'id6' }, { $push: { fruits: {$each: ['banana', 'orange'] } } }, {}, function () {
  // Now the fruits array is ['apple', 'orange', 'pear', 'banana', 'orange']
});
```

Removing
-------------

### Removing a document instance
```javascript
// if you have the document instance at hand, you can just
Doc.findOne({ planet: 'Mars' }, function(err, doc) {
	doc.remove(function() {
		// done
	});	
});
```

### Removing from the collection
`Doc.remove(query, options, callback)` will remove all documents matching `query` according to `options`  
* `query` is the same as the ones used for finding and updating
* `options` only one option for now: `multi` which allows the removal of multiple documents if set to true. Default is false
* `callback` is optional, signature: err, numRemoved

```javascript
// Let's use the same example collection as in the "finding document" part
// { _id: 'id1', planet: 'Mars', system: 'solar', inhabited: false }
// { _id: 'id2', planet: 'Earth', system: 'solar', inhabited: true }
// { _id: 'id3', planet: 'Jupiter', system: 'solar', inhabited: false }
// { _id: 'id4', planet: 'Omicron Persia 8', system: 'futurama', inhabited: true }

// Remove one document from the collection
// options set to {} since the default for multi is false
Planet.remove({ _id: 'id2' }, {}, function (err, numRemoved) {
  // numRemoved = 1
});

// Remove multiple documents
Planet.remove({ system: 'solar' }, { multi: true }, function (err, numRemoved) {
  // numRemoved = 3, all planets from the solar system were removed
});
```

Events
---------------

```javascript
// Hook-like
Doc.on('save', function(doc) { }) // Will be called before saving a document - no matter if using save, insert or update methods. You can modify the document in this event, it's essentially a hook
Doc.on('insert', function(doc) { }) // Will be called before saving a new document - again, no matter if using save/insert/update methods. You can modify the document in this event
Doc.on('remove', function(doc) { }) // Before removing a document; called with the document about to be removed

Doc.on('construct', function(doc) { }) // When a document is constructed

// After operation is complete
Doc.on('inserted', function(docs) { }) // Called after inserting new documents is complete; docs is an array of documents
Doc.on('updated', function(docs) { }) // Called after updating documents is complete; docs is an array of documents
Doc.on('removed', function(ids) { }) // Called after removing documents is complete; ids is an array of ids
```


Schemas
------
You can define a schema for a model, allowing you to enforce certain properties to types (String, Number, Date), set defaults and also define properties with getter/setter. Since schema support is implemented deep in LinvoDB, you can query on fields which are getter/setter-based and rely that types/defaults are always going to be enforced.

**NOTE: when constructing a model with a schema, please specify options object after the schema, otherwise schema will be treated as options: `new LinvoDB(name, schema, options)`**

Schemas are defined as an object of specs for each property. The spec can have properties:

* `type` - the type to be enforced, can be String, Number, Date along with "string", "number", "date" alternative syntax. Can also be a RegExp instance in case you want to validate against that expression.
* `default` - the default value; must comply to the type obviously
* `enumerable` - whether this property will be enumerable
* `get` - getter, cannot be used with type/default
* `set` - setter, cannot be used with type/default
* `index`, `sparse`, `unique` - booleans, whether to create an index and it's options

If type is all you need, you can shorthand the property to the type only, e.g. `{ name: String }`.
You can also define a property as an "array of" by setting it to `[spec]`, for example `[String]` for an array of strings.
Nested objects are supported.

```javascript
var Person = new LinvoDB("person", { 
	name: { type: String, default: "nameless" }, // default value
	age: Number, // shorthand to { type: ... }
	created: Date, 
	address: { // nested object
		line1: String,
		line2: String
	},
	department: { type: String, index: true }, // you can use the schema spec to define indexes
	favNumbers: [Number], // array of
	firstName: { get: function() { return this.name.split(" ")[0] } }
}, { });

var p = new Person();
// p is { name: 'nameless', age: 0, created: /* date when created */, address: { line1: "", line2: "" }, favNumbers: [] }

p.name = 23;
// p.name becomes "23"

p.created = "10/23/2004"; 
// p is 23 October 2004, date object

p.favNumbers.push(22);
p.favNumbers.push("42"); // favNumbers will be [22, 42] ; the string will be cast to a number
p.favNumbers.push("forty five"); // nothing happens, can't cast
// p.favNumbers is [22, 42]

p.name = "John Smith"; 
// p.firstName is "John"

p.save(function() { 
	// Person is saved
	// You can even query on virtual properties

	Person.find({ firstName: "John" }, function(err, res) { /* res will be [p] */ });
});
```



Model - static & instance methods
-----------
```javascript
// var doc = new Doc(); // create a new instance
// Or get it from query results

doc.remove(function(err) { /* removes the document*/ })
doc.save(function(err) { /* saves the document*/ })
doc.copy(); // returns a copy of the document
```

You can define additional functions for both the model and the document instances.
```javascript
Planet.static("findAllSolar", function(cb) { return Planet.find({ system: 'solar' }).exec(cb) });
Planet.findAllSolar(function(err,res) {  /* res is all planets in the solar system */  });

Planet.method("findSameSystem", function(cb) { return Planet.find({ system: this.system }).exec(cb) });
Planet.findOne({ planet: 'Earth' }, function(err, doc) {
	doc.findSameSystem(function(err,res) { /* res is all planets in the solar system */ })
});
```


Indexing
----------
Indexing in LinvoDB is automatic, although you can turn that off (`{autoindex: false}` in model options, not recommended). Defining indexes, in case you need you enforce a unique constraint, happens with `Doc.ensureIndex({ fieldName: "name", unique: true })`. 

The full syntax is `Doc.ensureIndex(options, cb)`, where callback is optional and get passed an error if any (usually a unique constraint that was violated). `ensureIndex` can be called when you want, even after some data was inserted, though it's best to call it at application startup. The options are:  

* **fieldName** (required): name of the field to index. Use the dot notation to index a field in a nested document.
* **unique** (optional, defaults to `false`): enforce field uniqueness. Note that a unique index will raise an error if you try to index two documents for which the field is not defined.
* **sparse** (optional, defaults to `false`): don't index documents for which the field is not defined. Use this option along with "unique" if you want to accept multiple documents for which it is not defined.

You can remove a previously created index with `Doc.removeIndex(fieldName, cb)`.

**NOTE compound indexes are currently not supported.**


Promises with Bluebird
----------
Even though LinvoDB does not support Promises out-of-the-box, it can easily be
made promise-friendly using [Bluebird's promisification feature](http://bluebirdjs.com/docs/api/promisification.html):


```javascript

var LinvoDB = require("linvodb3");
var Promise = require("bluebird");

var Planet = new LinvoDB('planet', {});

Promise.promisifyAll(Planet.find().__proto__);
// As of this line, LinvoDB APIs now have promise-returning methods with *Async suffix.
// All the callback-based APIs are still there and will work as before.

Planet.find({ system: 'solar' }).limit(10).execAsync().then(function(docs) {
	// use docs somehow
}).catch(function(err) {
	// handle errors
});

// or, if you use ES7 async / await:

try {
	var docs = await Planet.find({ system: 'solar' }).limit(10).execAsync();
	// use docs somehow
} catch (err) {
	// handle errors
}
```


Utilization
-------------
**[Stremio](http://strem.io)** - LinvoDB was created specifically because NeDB started to behave suboptimally with >300 movie/series metadata objects, which were pretty large. Reduced memory usage from ~500MB to ~100MB. Live queries, schemas and map/reduce helped create a much cleaner codebase.

_If you wish to add something here, contact me at ivo@linvo.com_

License 
-------------
See [License](LICENSE)


Help
-------------
Pull requests are always welcome. :)
