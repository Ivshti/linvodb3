var _ = require('lodash');



/* We can pass an object as a spec which really describes a single type, and not a sub-object
 * e.g. { type: "string", index: true }
 * */
var specAllowedKeys = ["type", "index", "unique", "sparse", "default", "ref"];

function isSpec(spec)
{
    return typeof(spec) == "object" 
        && _.keys(spec).every(function(x) { return _.contains(specAllowedKeys, x) });
};

function normalize(schema) {
	if (typeof(schema) != "object") return schema;
	
	_.each(schema, function(spec, key) {
		schema[key] = isSpec(spec) ? spec : { type: normalize(spec) };
	});

	return schema;
};

function construct(self, schema) {
	// TODO: recursion, just copy everything from validate.js
	// TODO: incorporate _ctime and _mtime here, making them default non-enumerable date props
	
	// Has some minor increase on time it takes to do DB operations - but we want schema support
	_.each(schema, function(spec, key) {
		if (! spec.type) return; 

		var val;
		if (self[key] && canCast(self[key], spec.type)) val = castToType(self[key], spec.type);
		else if (spec.hasOwnProperty("default") && canCast(spec.default, spec.type)) val = castToType(spec.default, spec.type);
		else val = defaultValue(spec.type);

		Object.defineProperty(self, key, { 
			enumerable: true, 
			get: function() {
				return val;
			},
			set: function(v) {
				if (canCast(v, spec.type)) val = castToType(v, spec.type);
			}
		});
	});
	
	return self;
};



function canCast(val, spec)
{
    if (spec == "string" && val && val.toString) return true;
    if (spec == "number" && !isNaN(val)) return true;
    if (spec == "date" && !isNaN(new Date(val).getTime())) return true;
    return false;
};

function castToType(val, spec)
{
    if (spec == "string") return val.toString();
    if (spec == "number") return parseFloat(val);
    if (spec == "date") return new Date(val);
};

// TODO: copy from validate.js
function defaultValue(spec)
{
	return ({
        "string": "",
        "id": null,
        "number": 0,
        "boolean": false,
        "date": new Date(),
        "regexp": new RegExp(),
        "function": function() { },
        "object": {}
    })[spec];
};


function getIndexes(obj, prefix) {
  var indexes = [], prefix = prefix || "";
  _.each(obj, function(spec, key)
  {
  		if (typeof(spec.type) == "object") return indexes = indexes.concat(getIndexes(spec.type, prefix+key+"."));
     	if (spec.index)  // now we know spec is a special object: add the index
         	indexes.push({ fieldName: prefix+key, sparse: spec.sparse, unique: spec.unique });
  });
  return indexes;
};


module.exports.construct = construct;
module.exports.normalize = normalize;
module.exports.indexes = getIndexes;
