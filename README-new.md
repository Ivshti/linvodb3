LinvoDB
=========

LinvoDB is a Node.js/NW.js persistent DB with MongoDB / Mongoose-like features and interface.

Features:

* **MongoDB-like query engine**
* Persistence built on LevelUP - you can **pick back-end**
* **NW.js friendly** - JS-only backend is [Medea](https://github.com/medea/medea)
* **Performant** - steady performance unaffected by DB size - queries are always indexed
* Auto-indexing
* **Live queries** - make the query, get constantly up-to-date results
* **Schemas** - built-in schema support
* **Efficient Map / Reduce / Limit**

Relationship to NeDB
--------------------
LinvoDB is based on NeDB, the most significant core change is that it uses LevelUP as a back-end, meaning it doesn't have to keep the whole dataset in memory. LinvoDB also can do a query entirely by indexes, meaning it doesn't have to scan the full database on a query. 

In general:

* LinvoDB is better for large datasets (many objects, or large objects) because it doesn't keep the whole DB in memory and doesn't need to always scan it
* LinvoDB does the entire query through the indexes, NeDB scans the DB
* Both LinvoDB and NeDB play well with NW.js (node-webkit). LinvoDB can be initialized with the JS-only MedeaDown back-end.
* NeDB is ultra-fast because the DB is in memory, LinvoDB's performance is comparible to MongoDB
* LinvoDB has live queries, map/reduce and schema support.


Install, Initialize, pick back-end
-------------------------

Install:
```javascript
npm install linvodb3 medeadown # For NW.js, using Medea
npm install leveldb3 leveldown # For pure node.js, using LevelDB
```

Initialize:
```javascript
var LinvoDB = require("linvodb3");
LinvoDB.defaults.store = { db: require("medeadown") }; // Comment out to use LevelDB instead of Medea

var Doc = new LinvoDB("doc", { /* schema, can be empty */ })
```

Initialization, detailed:
```javascript
var LinvoDB = require("linvodb3");
var modelName = "doc";
var schema = { }; // Non-strict always, can be left empty
var options = { };
// options.filename = "./test.db"; // Path to database - not necessary 
// options.store = { db: require("medeadown") }; // Options passed to LevelUP constructor 
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
doc.b = 13;
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

The basic syntax is 
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
-------------
Once you have a `Cursor` object, returned by calling `find` without a callback, you can turn it into a live query, meaning the `.res` property will always be up-to-date results from the query. Of course, all modifiers, such as `limit`, `skip`, `sort`, `map`, `reduce`, `filter` and `aggregate` will still apply.
An event will be emitted when the result is updated - `liveQueryUpdate` on the model itself.

// basic
// events
// angular disclaimer - debounce - If you plan to use LinvoDB live queries with AngularJS and update the scope on data update, use the liveQueryUpdate event, but please debounce it in order to avoid excessive scope apply calls.

Updating
---------
// instance.save
// model.update

Removing
---------
// instance.remove
// model.remove


Schemas
------------

Model - static & instance methods
-----------

Events
------


Indexing
----------


Donate
-------------
LinvoDB is open source and free to use, but if you found it useful in your project you can donate to ensure the continued support for LinvoDB at this BTC address: 