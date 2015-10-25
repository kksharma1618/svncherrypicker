#! /usr/bin/env node
var program = require('commander');
var _ = require("underscore");
require("colors");
var moment = require("moment");

var core = require("../index");
program.version('1.0.0');

program
    .command('setup [source] [destination]')
    .description('setup current session. all future commands will use these values')
    .action(function(source, destination){
        core.setupCurrentSession(source, destination, "");
        console.log('Current session saved'.green);
    });

program
    .command('populate')
    .description('finds unmerged commits from source to destination. caches them (including log details) for fast access. depending on the number of unmerged commits it can take a long time to finish')
    .action(function(){
        core.cacheUnmergedCommits(function(err, data) {
            console.log(err ? (err+"").red : 'Done'.green);
        });
    });

program
    .command('pick [revisions]')
    .option('-f, --full-view', 'Displays full view of picked revisions')
    .option('-c, --display [display]', '"c" => "only counts", "t" => "table", "j" => "json"')
    .option('-u, --fields [fields]', 'Which fields to display? "a,d,p,m" author,date,paths,message') 
    .description('Picks provided revisions and append to the save list. Revisions can be csv of revision "2,3,4". Or "last" in that case the filtered revisions of last filter command will be picked. Leave empty to see current picked revisions')
    .action(function(revisions, p){
        core.pickRevisions(revisions, function(err, revs) {
            if(err) {
                return console.log((err+"").red);
            }
            if(p.fullView) {
                core.filter({
                    revs: revs,
                    dontUpdateLast: true
                }, function(err, revs) {
                    if(err) {
                        console.log((err+"").red);
                    }
                    else {
                        var display = p.display;
                        if(["c", "t", "j"].indexOf(display) < 0) {
                            display = "t";
                        }
                        var fields = p.fields ? p.fields.split(",") : ["a", "d", "p", "m"];
                        var a = [],b = ["a", "d", "m", "p"];
                        var rf = {};
                        rf.rev = "Revision";
                        fields.forEach(function(f) {
                            f = f.trim();
                            if(b.indexOf(f) >= 0) {

                                if(f == "a") {
                                    rf.author = "Author";
                                }
                                if(f == "d") {
                                    rf.date = "Date";
                                }
                                if(f == "m") {
                                    rf.message = "Message";
                                }
                                if(f == "p") {
                                    rf.paths = "Paths";
                                }
                                a.push(f);
                            }
                        });

                        var r = revs.map(function(r) {
                            r = r.log;
                            var j = {
                                rev: r.rev
                            };
                            if(fields.indexOf("a") >= 0) {
                                j.author = r.author;
                            }
                            if(fields.indexOf("d") >= 0) {
                                j.date = display == "j" ? r.date : moment(r.date).format("Do MMM YYYY");
                            }
                            if(fields.indexOf("p") >= 0) {
                                j.paths = display == "j" ? r.paths : r.paths.join("\n");
                            }

                            if(fields.indexOf("m") >= 0) {
                                j.message = r.message;
                            }
                            return j;
                        });

                        switch(display) {
                            case "c":
                            console.log('Picked revisions %d'.green, revs.length);
                            break;

                            case "j":
                            console.log(JSON.stringify(r, null, 4));
                            break; 

                            case "t":
                            core.utils.printObjectsInTable(r, rf);
                            break;
                        }
                    }

                });
            }
            else {
                if(p.display == "c") {
                    return console.log('Picked revisions %d', revs.length);
                }
                console.log('Picked revisions %s', revs.join(","));
            }
        });
    });

program
    .command('unpick [revisions]')
    .description('Un-picks provided revisions and removes from the saved list. Revisions can be csv of revision "2,3,4". Or "last" in that case the filtered revisions of last filter command will be unpicked. Or "all" in case entire list will be cleared')
    .action(function(revisions){
        core.pickRevisions(revisions, function(err, revs) {
            console.log(err ? (err+"").red : 'Done'.green);
            console.log('Picked revisions %s', revs.join(","));
        }, true);
    });

program
    .command('merge')
    .description('Prints merge command using current session and currently picked revisions')
    .action(function(){
        core.getMergeCommand(function(err, cmd) {
            console.log(err ? (err+"").red : cmd);
        });
    });



program
    .command('filter')
    .option('-a, --author [author]', 'Filter by author. Exact string match')
    .option('-m, --message [message]', 'Filter by message. String/Regex. Regex match using "r:<regex>. Eg: "r:sent" => /sent/')
    .option('-p, --paths [paths]', 'Filter by changed/added/deleted files/folders. Glob pattern match using "g:<pattern>". Regex match using "r:<regex>')
    .option('-z, --date-before [datebefore]', 'Filter by date. Before passed date. Date in yyyy-mm-dd format')
    .option('-y, --date-after [dateafter]', 'Filter by date. After passed date. Date in yyyy-mm-dd format')
    .option('-d, --date [date]', 'Filter by date. Exact date match.  Date in yyyy-mm-dd format')
    .option('-x, --rev-after [revafter]', 'Filter all revisions after this revision')
    .option('-w, --rev-before [revbefore]', 'Filter all revisions before this revision')
    .option('-c, --display [display]', '"c" => "only counts", "t" => "table", "j" => "json"')
    .option('-u, --fields [fields]', 'Which fields to display? "a,d,p,m" author,date,paths,message')
    .description('Filters revisions. You can save the filter revisions and then use those revisions to create merge command')
    .action(function(p) {


        core.filter({
            author: p.author,
            message: p.message,
            paths: p.paths,
            dateBefore: p.dateBefore,
            dateAfter: p.dateAfter,
            date: p.date,
            revAfter: p.revAfter,
            revBefore: p.revBefore,
            display: p.display,
            fields: p.fields
        }, function(err, revs) {
            if(err) {
                console.log((err+"").red);
            }
            else {
                var display = p.display;
                if(["c", "t", "j"].indexOf(display) < 0) {
                    display = "t";
                }
                var fields = p.fields ? p.fields.split(",") : ["a", "d", "p", "m"];
                var a = [],b = ["a", "d", "m", "p"];
                var rf = {};
                rf.rev = "Revision";
                fields.forEach(function(f) {
                    f = f.trim();
                    if(b.indexOf(f) >= 0) {

                        if(f == "a") {
                            rf.author = "Author";
                        }
                        if(f == "d") {
                            rf.date = "Date";
                        }
                        if(f == "m") {
                            rf.message = "Message";
                        }
                        if(f == "p") {
                            rf.paths = "Paths";
                        }
                        a.push(f);
                    }
                });

                var r = revs.map(function(r) {
                    r = r.log;
                    var j = {
                        rev: r.rev
                    };
                    if(fields.indexOf("a") >= 0) {
                        j.author = r.author;
                    }
                    if(fields.indexOf("d") >= 0) {
                        j.date = display == "j" ? r.date : moment(r.date).format("Do MMM YYYY");
                    }
                    if(fields.indexOf("p") >= 0) {
                        j.paths = display == "j" ? r.paths : r.paths.join("\n");
                    }

                    if(fields.indexOf("m") >= 0) {
                        j.message = r.message;
                    }
                    return j;
                });

                switch(display) {
                    case "c":
                        console.log('%d matched revisions'.green, revs.length);
                    break;

                    case "j":
                        console.log(JSON.stringify(r, null, 4));
                    break; 

                    case "t":
                        core.utils.printObjectsInTable(r, rf);
                    break;
                }
            }
        });

    });


// parse command line args
program.parse(process.argv);

if (!process.argv.slice(2).length) { // empty call will print help
    program.outputHelp();
}