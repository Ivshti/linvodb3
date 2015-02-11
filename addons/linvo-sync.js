var async = require("async"),
    fs = require("fs"),
    _ = require("underscore");

module.exports = function setupSync(model, api, options)
{
    if (model.linvoSync) return;
    model.linvoSync = true;

    var options = options || {};

    var status = function(s) {
        if (options.log) console.log("LinvoDB Sync: "+s);
    };

    var dirty = false;
    var triggerSync = function(cb)
    { 
        dirty = true;
        q.push({}, cb);
    };
    model.on("updated", function(items, quiet) { if (!quiet) triggerSync() });
    model.on("inserted", function(items, quiet) { if (!quiet) triggerSync() });
    model.static("triggerSync", triggerSync);

    /* We need to run only one task at a time */
    var q = async.queue(function(opts, cb)
    {
        if (! api.user) return cb();
        if (! dirty) return cb();

        var baseQuery = { collection: options.remoteCollection || model.modelName };
        var remote = {}, push = [], pull = [];

        async.auto({
            retrieve_remote: function(callback)
            {
                api.request("datastoreMeta", baseQuery, function(err, meta)
                { 
                    if (err) return callback(err);

                    meta.forEach(function(m) { remote[m[0]] = new Date(m[1]).getTime() });
                    callback();
                });
            },
            compile_changes: ["retrieve_remote", function(callback)
            {
                model.find({ }, function(err, results)
                {
                    if (err) return callback(err);

                    results.forEach(function(r) {
                        if ((remote[r._id] || 0) > r._mtime.getTime()) pull.push(r._id);
                        if ((remote[r._id] || 0) < r._mtime.getTime()) push.push(r);
                        delete remote[r._id]; // already processed
                    });
                    pull = pull.concat(_.keys(remote)); // add all non-processed to pull queue
                    callback();

                    // It's correct to mark the DB before commiting the changes, but when compiling the list of changes
                    // Until the changes are commited, more changes might occur
                    dirty = false;                
                }, true);
            }],
            push_remote: ["compile_changes", function(callback)
            {
                status("pushing "+push.length+" changes to remote");

                api.request("datastorePut", _.extend({ }, baseQuery, { changes: 
                    push.map(function(x) { 
                        var item = _.extend({ }, x);
                        if (x._mtime) x._mtime = x._mtime.getTime();
                        if (x._ctime) x._ctime = x._ctime.getTime();
                        return item;
                    })
                }), callback);
            }],
            pull_local: ["compile_changes", function(callback)
            {
                api.request("datastoreGet", _.extend({ }, baseQuery, { ids: pull }), function(err, results)
                {
                    if (err) return callback(err);

                    status("pulled "+results.length+" down");

                    results.forEach(function(x) {
                        x._ctime = new Date(x._ctime || 0);
                        x._mtime = new Date(x._mtime || 0);
                    });

                    model.save(results, function(err)
                    {
                        if (err) console.error(err);
                        callback();

                        if (results.length) model.emit("liveQueryRefresh");
                    }, true); // True for quiet mode, not emit any events
                });
            }],
            finalize: ["push_remote", "pull_local", function(callback)
            {
                status("sync finished");

                callback();
            }]
        }, cb);
    }, 1);
}
