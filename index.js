var fs = require("fs-extra");
var path = require("path");
var Client = require("svn-spawn");
var svn = new Client({
    cwd: process.cwd()
});
var md5 = require("md5");
var async = require("async");
var _ = require("underscore");
var clui = require("clui");
var minimatch = require("minimatch");



var core = {};
var options = {
    dataFolder: path.resolve(__dirname, "data")
};

// utils
core.utils = require("./utils");


/**
 * loads current session from data/current_session.json file
 * 
 * @return Object {
 *         source: "",
 *         destination: ""
 * }
 */
core.loadCurrentSession = function() {
    var file = path.resolve(options.dataFolder, "current_session.json");
    return fs.existsSync(file) ? fs.readJsonSync(file) : false;
};
var currentSession = core.loadCurrentSession();


/**
 * sets up current session. saves it to data/current_session.json
 * 
 * @param  {String} source      source url for merging
 * @param  {String} destination destination url for merging
 * @param  {String} baseUrl     baseurl of svn. not used currently
 */
core.setupCurrentSession = function(source, destination, baseUrl) {
    fs.outputJsonSync(path.resolve(options.dataFolder, "current_session.json"), {
        source: source,
        destination: destination,
        baseUrl: baseUrl || ""
    });
};


/**
 * Uses mergeinfo command to find out list of unmerged commits between source and destination. uses svn log on each of them to get their details. caches in local file
 * 
 * @param  {Function} next called on completion or error
 */
core.cacheUnmergedCommits = function(next) {
    if(!currentSession) {
        return next('no session');
    }
    var key = md5(currentSession.source+'::::'+currentSession.destination);
    var cacheFile = path.resolve(options.dataFolder, "unmerged_revs_"+key+".json");
    svn.cmd(['mergeinfo', currentSession.source, currentSession.destination, "--show-revs", "eligible"], function(err, data) {
        var revs = [];
        if(data) {
            var a = data.split("\n");
            a.forEach(function(r) {
                r = r.trim();
                if(r && r.indexOf('r') === 0) {
                    r = r.replace('r', '');
                    r = parseInt(r, 10);
                    if(r) {
                        revs.push(r);
                    }
                }
            });

            console.log('%d unmerged revs found', revs.length);

            
            var j = {
                revisions: {},
                source: currentSession.source,
                destination: currentSession.destination
            };

            var spinner = new clui.Spinner('Getting info for revisions [0/'+revs.length+']');
            spinner.start();

            var tasks = [];

            var oj = false;
            tasks.push(function(next) {
                if(!fs.existsSync(cacheFile)) {
                    return next();
                }
                oj = fs.readJsonSync(cacheFile);
                next();
            });

            var done = 0;
            revs.forEach(function(r) {
                tasks.push(function(next) {
                    if(oj && oj.revisions && oj.revisions["r"+r] && oj.revisions["r"+r]["log"]["paths"].length) {

                        j.revisions["r"+r] = _.extend({}, oj.revisions["r"+r]);
                        done++;
                        spinner.message('Getting info for revisions ['+done+'/'+revs.length+']');
                        return next();
                    }
                    core.getLog(r, currentSession.source, function(err, log) {
                        if(err) {
                            return next(err);
                        }
                        j.revisions["r"+r] = {
                            rev: r,
                            log: log
                        };
                        done++;
                        spinner.message('Getting info for revisions ['+done+'/'+revs.length+']');
                        next();
                    });
                });
            });

            async.series(tasks, function(err) {
                spinner.stop();
                if(!err) {
                    fs.outputJsonSync(cacheFile, j);
                }
                next(err, j);
            });
        }
        else {
            next(null, false)
        }
    });
};
/**
 * uses svn log to get details of revisions
 * 
 * @param  {Integer}   rev  revision number
 * @param  {String}   url  url of the repository
 * @param  {Function} next Called with err, response
 */
core.getLog = function(rev, url, next) {
    svn.getLog([url, '--revision='+rev, '--verbose'], function(err, log) {
        if(err) {
            return next(err);
        }
        if(!log || !log[0]) {
            return next('no entry found');
        }
        if(log[0]["paths"]["path"] && !_.isArray(log[0]["paths"]["path"])) {
            log[0]["paths"]["path"] = [log[0]["paths"]["path"]];
        }
        var r = {
            rev: log[0]["$"].revision,
            author: log[0]["author"],
            date: new Date(log[0]["date"]),
            paths: log[0]["paths"] && _.isArray(log[0]["paths"]["path"]) ? log[0]["paths"]["path"].map(function(v) {
                return v["_"];
            }) : [],
            message: log[0]["msg"]
        };
        next(err, r);
    });
};


/**
 * s -> r:<regex>
 * s -> r:f:<flags>:<regex>
 */

/**
 * parses regex provided in command line
 *
 * supported formats
 * r:<regex>
 * r:f:<flags>:<regex>
 *
 * examples:
 * r:sent => new RegExp("sent")
 * r:f:gi:sent => new RegExp("sent", "gi")
 * 
 * @param  {String} s regex string in supported format
 * @return {RegExp}
 */
function parseRegex(s) {
    s = s.substr(2);
    if(s.indexOf('f:') === 0) {
        s = s.substr(2);
        s = s.split(':');
        var f = s.shift();
        s = s.join(':');
        return new RegExp(s, f);
    }
    else {
        return new RegExp(s);
    }
}


/**
 * parses date from yyyy-mm-dd string format
 * 
 * @param  {String} s date
 * @return {Date}
 */
function parseDate(s) {
    s = s.trim().split("-");
    return new Date(s[0], s[1]-1, s[2]);
}

/**
 * Use core.setupSession and core.cacheUnmergedCommits commands before calling this. It gets list of unmerged revisions (depending on current session). And filters the list by provided options. 
 *
 * Options:
 {
    author: "filter by this author",
    message: "filter by this message; string/regex"
    paths: "filter by files/folders; string/regex/glob",
    dateBefore: "filter revisions before this date",
    dateAfter: "filter revisions after this date",
    date: "filter revisions by this date",
    revAfter: "filter revisions after this number",
    revBefore: "filter revisions before this number",
    display: "c or t or j", //"c" => "only counts", "t" => "table", "j" => "json"
    fields: "Which fields to display? 'a,d,p,m' author,date,paths,message"
}

 * supported regex formats
 * r:<regex>
 * r:f:<flags>:<regex>
 *
 * supported date formats
 * yyyy-mm-dd
 *
 * supported glob formats
 * g:<glob>
 * see https://github.com/isaacs/minimatch for <glob> format
 * 
 * @param  {Object}   o    Options
 * @param  {Function} next called with err, filtered revs
 */
core.filter = function(o, next) {
    if(!currentSession) {
        return next('no session');
    }
    var key = md5(currentSession.source+'::::'+currentSession.destination);
    var cacheFile = path.resolve(options.dataFolder, "unmerged_revs_"+key+".json");
    if(!fs.existsSync(cacheFile)) {
        return next('run populate before this');
    }
    var j = fs.readJsonSync(cacheFile);
    if(!j || _.isEmpty(j.revisions)) {
        return next('no revisions');
    }

    var revs = [];
    var s;
    for(var i in j.revisions) {
        if(j.revisions.hasOwnProperty(i)) {
            var r = j.revisions[i].log;
            r.date = new Date(r.date);
            r.rev = parseInt(r.rev, 10);

            // filter
            if(o.author && r.author != o.author) {
                continue;
            }

            if(o.message) {
                s = o.message;

                if(s.indexOf("r:") === 0) {
                    s = parseRegex(s);
                    if(!s.test(r.message)) {
                        continue;
                    }
                }
                else {
                    if(r.message.toLowerCase().indexOf(s.toLowerCase()) <= 0) {
                        continue;
                    }
                }
            }

            if(o.paths) {
                s = o.paths;
                if(!_.isArray(r.paths) || !r.paths.length) {
                    continue;
                }
                if(s.indexOf("r:") === 0) {

                    s = parseRegex(s);

                    var h = false;
                    r.paths.forEach(function(p) {
                        if(s.test(p)) {
                            h = true;
                        }
                    });
                    if(!h) {
                        continue;
                    }
                }
                else if(s.indexOf('g:') === 0) {
                    s = s.substr(2);
                    var h = false;
                    r.paths.forEach(function(p) {
                        if(minimatch(p, s,  { matchBase: true })) {
                            h = true;
                        }
                    });
                    if(!h) {
                        continue;
                    }
                }
                else {
                    var h = false;
                    s = s.toLowerCase();
                    r.paths.forEach(function(p) {
                        if(p.toLowerCase().indexOf(s) >= 0) {
                            h = true;
                        }
                    });
                    if(!h) {
                        continue;
                    }
                }
            }

            if(o.dateBefore) {
                s = parseDate(o.dateBefore);
                if(s <= r.date) {
                    continue;
                }
            }

            if(o.dateAfter) {
                s = parseDate(o.dateAfter);
                if(s >= r.date) {
                    continue;
                }
            }

            if(o.date) {
                s = parseDate(o.date);
                if(!(r.date.getFullYear() == s.getFullYear() && r.date.getMonth() == s.getMonth() && r.date.getDate() == s.getDate())) {
                    continue;
                }
            }

            if(o.revAfter && r.rev <= o.revAfter) { 
                continue;
            }

            if(o.revBefore && r.rev >= o.revBefore) {
                continue;
            }

            if(o.revs && _.isArray(o.revs)) {
                if(o.revs.indexOf(r.rev) < 0) {
                    continue;
                }
            }


            revs.push(_.extend({}, j.revisions[i]));
        }
    }

    if(!o.dontUpdateLast) {
        j.lastFilteredRevisions = revs.map(function(r) {
            return r.rev;
        });
    }
    

    fs.writeJsonSync(cacheFile, j);

    return next(null, revs);
};


/**
 * Calculate merge command based on currently picked revisions and current session
 * 
 * @param  {Function} next called with err, cmd
 */
core.getMergeCommand = function(next) {
    if(!currentSession) {
        return next('no session');
    }
    var key = md5(currentSession.source+'::::'+currentSession.destination);
    var cacheFile = path.resolve(options.dataFolder, "unmerged_revs_"+key+".json");
    if(!fs.existsSync(cacheFile)) {
        return next('run populate before this');
    }
    var j = fs.readJsonSync(cacheFile);
    if(!j || _.isEmpty(j.revisions)) {
        return next('no revisions');
    }

    var cmd = "svn merge ";
    if(j.pickedRevisions && j.pickedRevisions.length) {
        cmd+="-c"+j.pickedRevisions.join(",");
    }
    cmd +=" "+currentSession.source +" "+currentSession.destination;

    next(null, cmd);
};


/**
 * saves provided revisions for later use. appends if existing picked revisions there. kind of like shopping cart. you select items you want to buy. and on checkout you use core.getMergeCommand which uses picked items to create merge command
 *
 * if unpick arg is set to true, this unpicks items from the saved list (kind of like deleting items from your shopping cart)
 *
 * 
 * @param  {String}   revisions Following things are supported: "last" => picks revisions filtered by last call to core.filter. "3,4,5" => picks rev number 3,4,5. "all" => only supported in unpick mode. clears entire saved list
 * @param  {Function} next      called with err, currently picked revisions
 * @param  {Boolean}   unpick
 */
core.pickRevisions = function(revisions, next, unpick) {
    if(!currentSession) {
        return next('no session');
    }
    var key = md5(currentSession.source+'::::'+currentSession.destination);
    var cacheFile = path.resolve(options.dataFolder, "unmerged_revs_"+key+".json");
    if(!fs.existsSync(cacheFile)) {
        return next('run populate before this');
    }
    var j = fs.readJsonSync(cacheFile);
    if(!j || _.isEmpty(j.revisions)) {
        return next('no revisions');
    }

    j.pickedRevisions = j.pickedRevisions || [];

    var revs = [];

    if(!revisions && !unpick) {
        return next(null, j.pickedRevisions);
    }

    if(!revisions && unpick) {
        return next('Provide revisions field');
    }

    if(revisions == "all") {
        if(!unpick) {
            return next('Invalid revisions field "all"');
        }
    }
    else if (revisions == "last") {
        revs = j.lastFilteredRevisions || [];
    }
    else {
        var a = revisions.split(",");
        a.forEach(function(r) {
            r = parseInt(r.trim(), 10);
            if(r) {
                revs.push(r);
            }
        });
    }

    if(unpick) {
        if(revisions == "all") {
            j.pickedRevisions = [];
        }
        else {
            j.pickedRevisions = _.difference(j.pickedRevisions, revs);
        }
    }
    else {
        Array.prototype.push.apply(j.pickedRevisions, revs);
        j.pickedRevisions = _.uniq(j.pickedRevisions);
    }

    

    fs.writeJsonSync(cacheFile, j);
    next(null, j.pickedRevisions);
};


module.exports = core;


