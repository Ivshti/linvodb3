var LinvoDB = require("../");

// The following two lines are very important
// Initialize the default store to Medeadown - which is a JS-only store which will work without recompiling in NW.js / Electron
LinvoDB.defaults.store = { db: require("medeadown") }; // Comment out to use LevelDB instead of Medea
// Set dbPath - this should be done explicitly and will be the dir where each model's store is saved
LinvoDB.dbPath = process.cwd(); 

var Doc = new LinvoDB("doc", { /* schema, can be empty */ })

var d = new Doc();

d.name = "test";
d.saved = new Date();

d.save(function() {
	console.log("saved document with _id: " + d._id);
	Doc.count({},function(err, n) {
		console.log("document count "+n)
	});
});

