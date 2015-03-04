LinvoDB
----------


Relationship to NeDB
=================
LinvoDB is based on NeDB. The most significant core change is that it uses LevelUP as a back-end, meaning it doesn't have to keep the whole dataset in memory. LinvoDB also can do a query entirely by indexes, meaning it doesn't have to scan the full database on a query. 

In general:
* LinvoDB is better for large datasets (many objects, or large objects) because it doesn't keep the whole DB in memory and doesn't need to always scan it
* LinvoDB does the entire query through the indexes, NeDB scans the DB
* Both LinvoDB and NeDB play well with NW.js (node-webkit). LinvoDB can be initialized with the JS-only MedeaDown back-end.
* NeDB is ultra-fast because the DB is in memory, LinvoDB's performance is comparible to MongoDB
* LinvoDB has live queries, map/reduce and schema support.


Initialize, pick back-end
==========================


Querying
===================


Map / reduce
===================


Saving
===================


Removing
===================


Schemas
===================



Live Queries
===================



Events
===================



Indexing
==================



Donate
==================
LinvoDB is open source and free to use, but if you found it useful in your project you can donate to ensure the continued support for LinvoDB at this BTC address: 