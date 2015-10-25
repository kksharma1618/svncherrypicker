# svncherrypicker
a small command line utility written in nodejs to help find unmerged commits while cherrypicking in svn repositories

## Why this was created (motivation)?
I personally don't like to cherrypick in svn. But sometimes I have to work with teams where cherrypicking is normal part of the workflow. I wrote this utility to make cherrypicking a little easier.

## Workflow
1. **svncp setup**: Start a session by providing source and destination url for the svn repository (source to destination merge)
2. **svncp populate**: Find commits in source which are not yet merged to destination. Caches it for faster access.
3. **svncp filter**: Use filters commands to find revisions that you want. You can filter by author, dates, revision numbers, messages, updated files, etc.
4. **svncp pick/unpick**: Add/remove revision to/from save basket.
5. **svncp merge**: Once you have finalized revisions that you want to merge (using series of *svncp filter* and *svncp pick/unpick*), use this to generate merge command.


## Installation

Install using npm

``` bash
npm install -g svncherrypicker
```

## Help

``` bash
svncp --help
```

``` bash
svncp <command> -- help
```


## Sample usage

Assume that I have a svn repository at http://svnexample.com/repo1
I want to cherrypick some revisions from branches/feature1 to trunk.

**I will first setup the session**

``` bash
svncp setup http://svnexample.com/repo1/branches/feature1 http://svnexample.com/repo1/trunk
```

**I will then run populate command**

``` bash
svncp populate
```
It could take a while if there are a lot of unmerged commits between source and destination.

**I will then use filter command to find revisions**

by user1
``` bash
svncp filter --author user1
```

by message
``` bash
svncp filter --message somestring
svncp filter --message r:someregex
svncp filter --message r:f:i:someregex
```

by files/folders
``` bash
svncp filter --paths g:lib/*.js
svncp filter --paths r:someregex
svncp filter --paths exactpath
```

I can adjust the response of filter command by --display option.
I will use "c" to only display number of matched commits. "t" to display response in a table. "j" to return response in json format. 
I can also adjust which fields to return. "a,d,p,m" author,date,paths,message.

So for example:
``` bash
svncp filter --author user1 --paths g:lib/*.js --display t --fields "p,m"
```
Will return all the revisions made by user1 which changed/added/removed js files inside lib folder. It will print information in a table. It will only print Revision Number, Paths, and Message fields.

**Response**

| Revision Number | Paths           | Message  |
| ------------- | ------------- | ----- |
| 23      | lib/somefile.js | Updated it to do something |
| 34      | lib/someotherfile.js      |   Fixed some issue |

If I run svncp filter and I see the response where I want all the revisions.
I will just use
``` bash
svncp pick last
```
Which will add filtered revisions from last filter command to saved bucket.

If I only want few revisions from filtered response. I can just select them.

``` bash
svncp pick 23,45,67
```

I can use unpick command to remove some or all revisions from saved bucket.

``` bash
svncp unpick 23,67
svncp unpick all
svncp unpick last
```
unpick last removes all revisions which were returned by last filter command.

Using filter,pick,unpick command I can manage to find all the revisions I want to merge easily. After I have found all the revisions,
I will just run
```
svncp merge
```
Which will print the svn merge command using source/destination setting from current session and revisions from saved bucket.
I will then copy that command and run it to merge.

