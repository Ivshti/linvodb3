/**
 * Responsible for sequentially executing actions on the database
 * Allows us to have some control over execution, although it's designed to barebone for now
 */

var async = require('async')
  ;

function Executor () {

}

/**
 * If executor is ready, queue task (and process it immediately if executor was idle)
 * If not, buffer task for later processing
 * @param {Object} task
 *                 task.this - Object to use as this
 *                 task.fn - Function to execute
 *                 task.arguments - Array of arguments
 * @param {Boolean} forceQueuing Optional (defaults to false) force executor to queue task even if it is not ready
 */
Executor.prototype.push = function (task, forceQueuing) {
  var lastArg = task.arguments[task.arguments.length - 1];
  var newArguments = [];
  
  for (i = 0; i < task.arguments.length; i += 1) { newArguments.push(task.arguments[i]); }

  if (typeof lastArg === 'function') {
    callback = function () {
      lastArg.apply(null, arguments);
    };
    newArguments[newArguments.length - 1] = callback;
  } else {
    callback = function () { cb(); };
    newArguments.push(callback);
  }

  process.nextTick(function() { // required for the " Database Insert If the callback throws an uncaught execption, dont catch it inside findOne, this is userspace concern:" test case
    task.fn.apply(task.this, newArguments);
  })
};


// Interface
module.exports = Executor;
