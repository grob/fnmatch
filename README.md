# fnmatch

A RingoJS module for file path/name matching with shell glob patterns.

## Usage

```javascript
var fnmatch = require("fnmatch");
fnmatch.matches("test.js", "*.js"); // true
fnmatch.matches("test.js", "*.json"); // false
fnmatch.matches("fnmatch/lib/fnmatch.js", "**/*.js"); // true
fnmatch.matches("fnmatch/lib/fnmatch.js", "*/{lib,test}/fn*.{js,json}"); // true
```

## Features

- Single (`?`) and multiple (`*`) character wildcards
- Curly brace expansion (`{abc,def,ghj}`, `a{b,c{d,e},{f,g}h}x{y,z}`, `{0..9}`)
- Character classes (`[a-z]`)
- Globstar (`**`) matching
- Pattern negation (leading `!`)

## Methods

This module basically provides two methods: `matches(path, pattern, options)` for
path matching, and `filter(paths, pattern, options)` for path filtering.

### matches(path, pattern, options)

This method returns true if the provided path matches the specified glob pattern.

```javascript
var fnmatch = require("fnmatch");
fnmatch.matches("test.js", "*.js");
fnmatch.matches(".git", "*", {"dot": true});
```

### filter(paths, pattern, options)

This method filters the array of paths and returns those matching the provided
 glob pattern.

```javascript
var fnmatch = require("fnmatch");
var paths = fnmatch.filter([
    "README.md",
    "package.json",
    "lib/fnmatch.js",
    "test/fnmatch_test.js",
], "**/*.js");
console.dir(paths); // [ 'lib/fnmatch.js', 'test/fnmatch_test.js' ]
```

## Options

- `dot` (default: false): if true `*` and `?` match a leading dot
- `ignoreCase` (default: false): if true path matching is done in a case insensitive manner
- `globstar` (default: true): if false `**` doesn't traverse across directory boundaries, instead it's interpreted as two `*` wildcards

## Note for Windows users

This module expects all paths and patterns to contain a slash (`/`) as separator.
The backslash (`\`) is considered an escaping character, and as of now this module
does **not** convert backslashes into slashes.