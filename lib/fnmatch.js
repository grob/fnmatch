/**
 * @fileoverview This module provides glob pattern conversion, path matching
 * and filter functionality.
 *
 * Features:
 * - Single (`?`) and multiple (`*`) character wildcards
 * - Curly brace expansion (`{abc,def,ghj}`, `a{b,c{d,e},{f,g}h}x{y,z}`, `{0..9}`)
 * - Character classes (`[a-z]`)
 * - Globstar (`**`) matching
 * - Pattern negation (leading `!`)
 *
 * Supported options:
 * - `dot`: if true `*` and `?` match a leading dot (defaults to false)
 * - `ignoreCase`: if true path matching is done in a case insensitive manner
 * (defaults to false)
 * - `globstar`: if false `**` doesn't traverse across directory boundaries,
 * instead it's interpreted as two `*` wildcards
 *
 * All paths and glob patterns are expected in "slash-style" (i.e. using a `/`
 * as separator).
 *
 * @example
 * // path matching
 * const fnmatch = require("fnmatch");
 * fnmatch.matches("test.js", "*.js");
 * fnmatch.matches("test.js", "t{est,ango}.{js,json}");
 * fnmatch.matches("module/src/test.js", "**");
 * fnmatch.matches("01.json", "[0-9]{0..9}.json")
 */
const {Pattern} = java.util.regex;
const objects = require("ringo/utils/objects");

const PATH_SPLIT = /\/+/;
const GLOBSTAR = exports.GLOBSTAR = {};
const regexMetaChars = ".^$+{[]|()";
const globMetaChars = "\\*?[{";

/**
 * Default globbing options
 * @type {{dot: boolean, globstar: boolean, ignoreCase: boolean}}
 */
const OPTIONS = {
    "dot": false,
    "globstar": true,
    "ignoreCase": false,
    "negate": false
};

/**
 * Returns true if the character passed as argument is a regular expression
 * meta character
 * @param {String} char The character
 * @returns {boolean} True if the character is a regex meta character
 */
const isRegexMeta = (char) => {
    return regexMetaChars.indexOf(char) !== -1;
};

/**
 * Returns true if the character passed as argument is a glob meta character
 * @param {String} char The character
 * @returns {boolean} True if the character is a glob meta character
 */
const isGlobMeta = (char) => {
    return globMetaChars.indexOf(char) !== -1;
};

/**
 * Returns true if the character passed as argument is a glob or regex
 * meta character
 * @param {String} char The character
 * @returns {boolean} True if the character is a glob or regex meta character
 */
const isMetaChar = (char) => {
    return isRegexMeta(char) || isGlobMeta(char);
};

/**
 * Merges the options passed as argument with the default glob options
 * @param {Object} opts The options to merge
 * @returns {Object} The options merged with the default glob options
 */
const getOptions = exports.getOptions = (opts) => {
    return objects.merge(opts || {}, OPTIONS);
};

/**
 * Returns the index position of the closing curly brace within the pattern
 * passed as argument, or -1 if not found. This method respects both nested
 * curly braces and escaped ones.
 * @param {String} pattern The glob pattern
 * @param {Number} idx The index position to start at
 * @returns {Number} The index position of the closing curly brace
 */
const findClosingBrace = (pattern, idx) => {
    const len = pattern.length;
    let lvl = 1;
    while (idx < len) {
        let char = pattern[idx];
        if (char === "{" && pattern[idx - 1] !== "\\") {
            lvl += 1;
        } else if (char === "}" && pattern[idx - 1] !== "\\") {
            if ((lvl -= 1) === 0) {
                return idx;
            }
        }
        idx += 1;
    }
    return -1;
};

/**
 * Returns the index position of the closing bracket (`]`) within the pattern
 * passed as argument, or -1 if not found.
 * @param {String} pattern The glob pattern
 * @param {Number} idx The index position to start at
 * @returns {Number} The index position of the closing bracket
 */
const findClosingBracket = (pattern, idx) => {
    const len = pattern.length;
    let i = idx;
    while (i < len) {
        let char = pattern[i];
        // a closing bracket on first position is a literal
        if (char === "]" && i > idx) {
            return i;
        }
        i += 1;
    }
    return -1;
};

const last = (arr) => {
    return arr[arr.length - 1];
};

/**
 * Parses a curly-brace enclosed list into an array of members, each one being
 * either a string or an object containing `prefix`, `suffix` and a `members`
 * array with the list values.
 * @param {String} str The glob pattern
 * @param {Number} startIdx The starting index position of the list to parse
 * @param {Number} endIdx The index position of the closing curly brace
 * @param {Number} level The nesting level
 * @returns {Array} An array containing the (nested) list members
 */
const parseBrace = exports.parseBrace = (str, startIdx, endIdx, level) => {
    level || (level = 0);
    const members = [];
    const buf = [];
    const len = endIdx || str.length;
    let i = startIdx || 0;
    let escaped = false;
    while (i < len) {
        let char = str[i++];
        if (char === "\\") {
            escaped = true;
            buf.push("\\");
        } else if (!escaped) {
            switch (char) {
                case ".":
                    // could be a numeric sequence if followed by another dot
                    if (level > 0 && str[i] === char) {
                        // TODO: padding?
                        // TODO: a{b..d}e
                        let start = parseInt(buf.join(""), 10);
                        let end = parseInt(str.substring(i + 1, len), 10);
                        if (!isNaN(start) && !isNaN(end)) {
                            const increment = (start > end) ? -1 : 1;
                            for (i = start; i !== (end + increment); i += increment) {
                                members.push(i);
                            }
                            return members;
                        } else {
                            buf.push(char);
                        }
                    } else {
                        buf.push(char);
                    }
                    break;
                case ",":
                    if (level > 0) {
                        if (typeof last(members) === "object") {
                            last(members).suffix = buf.join("");
                        } else {
                            members.push(buf.join(""));
                        }
                        buf.length = 0;
                    } else {
                        buf.push(char);
                    }
                    break;
                case "{":
                    let j = findClosingBrace(str, i);
                    if (j === -1) {
                        // no closing bracket found - interpret as literal
                        buf.push("\\{");
                    } else {
                        let braceMembers = parseBrace(str, i, j, level + 1);
                        // braces with only one member are interpreted as literal
                        if (braceMembers.length <= 1) {
                            buf.push("\\{");
                            // think of "a{{b,c}}d" ...
                            if (typeof braceMembers[0] === "object") {
                                members.push(buf.join(""), braceMembers[0]);
                                buf.length = 0;
                            } else {
                                buf.push(braceMembers[0]);
                            }
                            buf.push("\\}");
                        } else {
                            members.push({
                                "prefix": buf.join(""),
                                "members": braceMembers,
                                "suffix": ""
                            });
                            buf.length = 0;
                        }
                        // skip closing brace
                        i = j + 1;
                    }
                    break;
                default:
                    buf.push(char);
                    break;
            }
        } else {
            buf.push(char);
            escaped = false;
        }
    }
    if (buf.length > 0) {
        if (typeof last(members) === "object") {
            last(members).suffix = buf.join("");
        } else {
            members.push(buf.join(""));
        }
    }
    return members;
};

/**
 * Convertes the character class passed as argument into a regex-compatible string
 * @param {String} content The content of the character class
 * @returns {String} A regex-compatible string
 */
const parseCharacterClass = (content) => {
    const buf = [];
    if (content[0] === "!") {
        buf.push("^");
        content = content.substring(0);
    }
    // escape backslashes and opening/closing brackets
    buf.push(content.replace(/([\\\[\]])/g, "\\$1"));
    return buf.join("");
};

/**
 * Procuces the cartesian product of the nested array passed as argument
 * @param {Array} list The source list array
 * @returns {Array} A 1-dimensional array containing the cartesian product
 */
const cartesian = (list, result, arr, idx) => {
    result || (result = []);
    arr || (arr = []);
    idx || (idx = 0);
    const max = list.length - 1;
    const len = list[idx].length;
    for (let j=0; j<len; j+=1) {
        let clone = arr.slice();
        clone.push(list[idx][j]);
        if (idx === max) {
            result.push(clone.join(""));
        } else {
            cartesian(list, result, clone, idx + 1);
        }
    }
    return result;
};

/**
 * Converts the value passed as argument into an array of values
 * @param {String|Object} val The value
 * @returns {Array} An array of string values
 */
const expand = (val) => {
    if (typeof(val) === "object") {
        return expandSet(val);
    }
    return [val];
};

/**
 * Converts the members of the given set into an array, pre-/appending prefix
 * and suffix of each member value.
 * @param {Object} set The member set
 * @returns {Array} A flat array containing the members of the set
 */
const expandSet = (set) => {
    return set.members.reduce((result, val) => {
        return result.concat(expand(val).map(v => {
            return [set.prefix, v, set.suffix].join("");
        }));
    }, []);
};

/**
 * Expands all curly brace enclosed lists specified in the given pattern into
 * an array containing all possible combinations.
 * @param {String} pattern The source pattern
 * @returns {Array} An array containing all possible combination patterns
 */
const expandBraces = exports.expandBraces = (pattern) => {
    return cartesian(parseBrace(pattern).map(expand));
};

/**
 * Helper function escaping all regex/glob meta characters in the buffer
 * passed as argument. This method manipulates the buffer only if its
 * `isRegExp` flag is set to false.
 * @param {Array} buf The buffer
 */
const escapeForRegex = (buf) => {
    if (buf.isRegExp === false) {
        buf.forEach((char, idx, arr) => {
            if (isMetaChar(char)) {
                arr[idx] = "\\" + char;
            }
        });
        buf.isRegExp = true;
    }
};

/**
 * Parses the glob pattern string passed as argument and returns either a string
 * if no glob meta characters (`*?[`) are found, or a regular expression. In the
 * former case it removes all escape characters if the next sibling isn't a meta
 * character.
 * @param {String} pattern The glob pattern
 * @param {Object} options An object containing boolean flags `ignoreCase` and
 * `dot`
 * @returns {String|java.util.regex.Pattern} The pattern as string or compiled
 * java regular expression pattern.
 */
const convertPattern = exports.convertPattern = (pattern, options) => {
    const buf = [];
    buf.isRegExp = false;
    // a leading "?" or "*" should not match a dot if options.dot is false
    if (!options.dot && ["*", "?"].indexOf(pattern.charAt(0)) > -1) {
        buf.isRegExp = true;
        buf.push("(?!\\.)");
    }
    const len = pattern.length;
    let i = 0, j;
    while (i < len) {
        let char = pattern[i++];
        if (char === "\\" && i < pattern.length) {
            let next = pattern[i++];
            if (buf.isRegExp && isMetaChar(next)) {
                buf.push("\\");
            }
            buf.push(next);
        } else {
            switch (char) {
                case "*":
                    escapeForRegex(buf);
                    if (i === 1) {
                        // a leading asterisk in a pattern must not match the
                        // empty string (ie. "a/*" must not match "a/")
                        buf.push("(?=[\\s\\S])");
                    }
                    buf.push("[\\s\\S]*");
                    break;
                case "?":
                    escapeForRegex(buf);
                    buf.push("[\\s\\S]");
                    break;
                case "[":
                    j = findClosingBracket(pattern, i);
                    if (j === -1) {
                        // no closing bracket found - interpret as literal
                        if (buf.isRegExp) {
                            buf.push("\\");
                        }
                        buf.push("[");
                    } else {
                        escapeForRegex(buf);
                        buf.push("[", parseCharacterClass(pattern.substring(i, j)), "]");
                        i = j + 1;
                    }
                    break;
                default:
                    if (buf.isRegExp && isMetaChar(char)) {
                        buf.push("\\");
                    }
                    buf.push(char);
                    break;
            }
        }
    }
    if (buf.isRegExp) {
        let flags = 0;
        if (options.ignoreCase === true) {
            flags |= Pattern.CASE_INSENSITIVE;
        }
        return Pattern.compile("^" + buf.join("") + "$", flags);
    }
    return buf.join("");
};

/**
 * Converts the glob pattern passed as argument into a list of patterns:
 * - first it expands all curly-braced lists contained in the pattern
 * - then it splits each of the patterns by slashes and converts each pattern
 * segment into a string, regular expression or `GLOBSTAR`.
 * @param {String} pattern The glob pattern
 * @param {Object} options An optional object containing boolean flags `dot`,
 * `globstar` and `ignoreCase`
 * @returns {Array} A two-dimensional array of patterns, each being an array
 * itself containing the pattern segments suitable for matching paths against
 */
const make = exports.make = (pattern, options) => {
    options || (options = {});
    // phase 1: expand braces
    const patternSets = expandBraces(pattern.trim());
    // phase 2: split into path segments and convert them regular expressions
    return patternSets.map(pattern => {
        return pattern.split(PATH_SPLIT).map(segment => {
            if (segment === "**" && options.globstar === true) {
                return GLOBSTAR;
            }
            return convertPattern(segment, options);
        });
    });
};

/**
 * Translates the glob pattern passed as argument into a set of patterns
 * suitable for matching paths against. This method consumes all negation
 * characters (`!`) at the beginning of the pattern and converts them into
 * an `isNegated` boolean flag. If the source pattern contains curly-braced
 * lists, this method will expand the pattern into multiple patterns for
 * every combination of the list members.
 * @param {String} pattern The glob pattern
 * @param {Object} options An optional object containing boolean flags `dot`,
 * `globstar` and `ignoreCase`
 * @returns {Object} An object containing a boolean `isNegated` flag and the
 * list of patterns the source pattern has been expanded into.
 */
const translate = exports.translate = (pattern, options) => {
    options || (options = {});
    let isNegated = options.negate === true;
    while (pattern.charAt(0) === "!") {
        isNegated = !isNegated;
        pattern = pattern.substring(1);
    }
    return {
        "patterns": make(pattern, options),
        "isNegated": isNegated
    };
};

/**
 * Matches the path segments against the pattern segments.
 * @param {Array} segments The path segments (i.e. the path to match against
 * split by slashes)
 * @param {Number} segmentIdx The current index position within the segments array
 * @param {Array} patterns The glob pattern segments (i.e. the glob pattern
 * split by slashes, as returned by `make()`)
 * @param {Number} patternIdx The current index position within the patterns array
 * @param {Object} options An optional object containing boolean flags `dot`
 * and `ignoreCase`
 * @returns {Boolean} True in case the path segments match the pattern ones
 */
const matchPattern = exports.matchPattern = (segments, segmentIdx, patterns, patternIdx, options) => {
    const segmentsLen = segments.length;
    const patternsLen = patterns.length;
    if (patternsLen === 1 && patterns[0] !== GLOBSTAR) {
        return segments.some(segment => {
            let pattern = patterns[0];
            if (!(pattern instanceof Pattern)) {
                if (options.ignoreCase === true) {
                    segment = segment.toLowerCase();
                    pattern = pattern.toLowerCase();
                }
                return segment === pattern;
            }
            return pattern.matcher(segment).matches();
        });
    }
    while (segmentIdx < segmentsLen && patternIdx < patternsLen) {
        let segment = segments[segmentIdx];
        let pattern = patterns[patternIdx];
        if (pattern === GLOBSTAR) {
            if (patternIdx === patternsLen - 1) {
                // ** at the end swallows the rest
                // however, it will not swallow /.x, unless options.dot is set
                // . and .. are *never* matched by **
                do {
                    segment = segments[segmentIdx];
                    if (segment === "." || segment === ".." ||
                        (!options.dot && segment.charAt(0) === ".")) {
                        return false;
                    }
                } while (++segmentIdx < segmentsLen);
                return true;
            }
            // take the rest of the patterns after the globstar and see
            // if they match
            let segmentRestIdx = segmentIdx;
            let patternRestIdx = patternIdx + 1;
            while (segmentRestIdx < segmentsLen) {
                let swallowed = segments[segmentRestIdx];
                if (matchPattern(segments, segmentRestIdx, patterns, patternRestIdx, options)) {
                    // the rest of the pattern set matches the path segment rest
                    return true;
                } else {
                    // can't swallow "." or ".."
                    // can only swallow ".foo" when explicitly asked.
                    if (swallowed === "." || swallowed === ".." ||
                        (!options.dot && swallowed.charAt(0) === ".")) {
                        break;
                    }
                }
                segmentRestIdx += 1;
            }
            return false;
        } else if (!(pattern instanceof Pattern)) {
            if (options.ignoreCase === true) {
                segment = segment.toLowerCase();
                pattern = pattern.toLowerCase();
            }
            if (pattern.length === 0) {
                segmentIdx -= 1;
            } else if (segment !== pattern) {
                return false;
            }
        } else {
            let result = pattern.matcher(segment).matches();
            if (result === false) {
                return false;
            }
        }
        segmentIdx += 1;
        patternIdx += 1;
    }

    if (segmentIdx === segmentsLen && patternIdx === patternsLen) {
        // perfect match
        return true;
    } else if (patternIdx === patternsLen) {
        // path segments left: only ok if we stopped at the last segment of
        // a path with a trailing slash
        return segmentIdx === segmentsLen - 1 && segments[segmentIdx] === "";
    }
    return false;
};

/**
 * Helper function returning a matcher function
 * @param {Array} patterns The glob pattern segments
 * @param {Boolean} isNegated True if the pattern passed as argument is negated
 * @param {Object} options An optional object containing boolean flags `dot`
 * and `ignoreCase` passed to the matcher
 */
const getMatcher = exports.getMatcher = (patterns, isNegated, options) => {
    options || (options = {});
    return (path) => {
        const pathParts = path.split(PATH_SPLIT);
        const isMatch = patterns.some(pattern => {
            return matchPattern(pathParts, 0, pattern, 0, options, false);
        });
        return isMatch === !isNegated;
    };
};

/**
 * Matches the path against the glob pattern
 * @param {String} path The path
 * @param {String} pattern The glob pattern to match against
 * @param {Object} opts Optional object containing boolean flags `dot`, `globstar`
 * and `ignoreCase`
 * @returns {Boolean} True if the glob pattern matches the path, false otherwise
 */
exports.matches = (path, pattern, opts) => {
    const options = getOptions(opts);
    const {patterns, isNegated} = translate(pattern, options);
    return getMatcher(patterns, isNegated, options)(path);
};

/**
 * Reduces the array of paths passed as argument to those matching the
 * specified glob pattern
 * @param {Array} paths The path array
 * @param {String} pattern The glob pattern to match against
 * @param {Object} opts Optional object containing boolean flags `dot`, `globstar`
 * and `ignoreCase`
 * @returns {Array} The matching paths
 */
exports.filter = (paths, pattern, opts) => {
    const options = getOptions(opts);
    const {patterns, isNegated} = translate(pattern, options);
    return paths.filter(getMatcher(patterns, isNegated, options));
};
