LinvoDB
=========

LinvoDB is a Node.js/NW.js persistent DB with MongoDB / Mongoose-like features and interface.

Features:

* MongoDB-like query engine
* Persistence built on LevelUP - you can pick back-end
* NW.js friendly - JS-only backend is (Medea)[https://github.com/medea/medea]
* Performant - steady performance unaffected by DB size - queries are always indexed
* Auto-indexing
* Live queries - make the query, get constantly up-to-date results
* Schemas - built-in schema support
* Efficient map / reduce

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
db.insert({ a: 3 }, function (err, newDoc) {
	console.log(newDoc._id);
});
db.insert([{ a: 3 }, { a: 42 }], function (err, newDocs) {
	// Two documents were inserted in the database
	// newDocs is an array with these documents, augmented with their _id

	// If there's an unique constraint on 'a', this will fail, and no changes will be made to the DB
	// err is a 'uniqueViolated' error
});

// Save document(s)
// save is like an insert, except it allows saving existing document too
db.save([ doc, { a: 55, test: ".save is handy" } ], function(err, docs) { 
	// docs[0] is doc
	// docs[1] is newly-inserted document with a=55 and has an assigned _id

	// Doing that with .insert would throw an uniqueViolated error for _id on doc, because it assumes all documents are new
});
```

Querying
------------------------
//basic
//sort
//order of execution

Map / reduce
------------
//order of execution

Live Queries
-------------
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