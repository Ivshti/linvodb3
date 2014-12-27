var _ = require('lodash');

function construct(self, schema) {

	return self;
};


/* We can pass an object as a spec which really describes a single type, and not a sub-object
 * e.g. { type: "string", index: true }
 * */
var specAllowedKeys = ["type", "index", "unique", "sparse", "default", "ref"];

function isSpecialSpec(spec)
{
    return typeof(spec) == "object" 
        && _.keys(spec).every(function(x) { return _.contains(specAllowedKeys, x) });
};

function getIndexes(obj, prefix) {
  var indexes = [], prefix = prefix || "";
  _.each(obj, function(val, key)
  {
      if (typeof(val) != "object") return;
      if (! isSpecialSpec(val)) // recursively find if we have indexes below TODO
          return indexes = indexes.concat(getIndexes(val, prefix+key+"."));
      if (val.index)  // now we know spec is a special object: add the index
          indexes.push({ fieldName: prefix+key, sparse: val.sparse, unique: val.unique });
  });
  return indexes;
};


module.exports.construct = construct;
module.exports.getIndexes = getIndexes;
