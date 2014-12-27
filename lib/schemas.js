var _ = require('lodash');

function construct(self, schema) {

	return self;
};

function getIndexes(obj, prefix) {
  var indexes = [], prefix = prefix || "";
  _.each(obj, function(val, key)
  {
      if (typeof(val) != "object") return;
      //if (! validator.isSpecialSpec(val)) // recursively find if we have indexes below TODO
      //    return indexes = indexes.concat(getIndexes(val, prefix+key+"."));
      if (val.index)  // now we know spec is a special object: add the index
          indexes.push({ fieldName: prefix+key, sparse: val.sparse, unique: val.unique });
  });
  return indexes;
};


module.exports.construct = construct;
module.exports.getIndexes = getIndexes;
