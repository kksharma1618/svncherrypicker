var Table = require("cli-table");
var _ = require("underscore");
var colors = require("colors");




/**
 * prints objects in table in command line
 *
 * @param {Array} objects array of objects
 * @param {Array|Object} keys only these keys will be printed
 * @param {Boolean} returnString returns string instead of printing it to console
 *
 * keys can be array of object
 * [key1, key2]
 * or
 * {
 * key1: name1,
 * key2: {
 *     name: name2,
 *     width: 200
 * }
 * }
 * 
 */
exports.printObjectsInTable = function(objects, keys, returnString) {
    var headers = [];
    var colWidths = false;
    if(_.isArray(keys)) {
        headers = keys;
    }
    else if(_.isObject(keys)) {
        for(var k in keys) {
            if(keys.hasOwnProperty(k)) {
                if(_.isObject(k)) {
                    headers.push(keys[k].name);
                    if(keys[k].width) {
                        if(!colWidths) {
                            colWidths = [];
                        }
                        colWidths.push(keys[k].width);
                    }
                }
                else {
                    headers.push(keys[k]);
                }
            }
        }
        keys = _.keys(keys);
    }

    var o = {
        head: headers
    };
    if(colWidths) {
        o.colWidths = colWidths;
    }

    var table = new Table(o);
    

    objects.forEach(function(o) {
        var v = [];
        keys.forEach(function(k) {
            v.push(o[k] || "");
        });
        table.push(v);
    });
    
    if(returnString) {
        return table.toString();
    }
    console.log(table.toString());
};

