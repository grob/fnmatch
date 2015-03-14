const PATH_SPLIT = /\/+/;
const GLOBSTAR = exports.GLOBSTAR = {};
const regexMetaChars = ".^$+{[]|()";
const globMetaChars = "\\*?[{";

var isRegexMeta = function(char) {
    return regexMetaChars.indexOf(char) != -1;
};

var isGlobMeta = function(char) {
    return globMetaChars.indexOf(char) != -1;
};

var isMetaChar = function(char) {
    return isRegexMeta(char) || isGlobMeta(char);
};

var findClosingBrace = function(pattern, idx) {
    var lvl = 1;
    var len = pattern.length;
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

var findClosingBracket = function(pattern, idx) {
    var len = pattern.length;
    var i = idx;
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

var last = function(arr) {
    return arr[arr.length - 1];
};

var parseBrace = exports.parseBrace = function(str, startIdx, endIdx, level) {
    level || (level = 0);
    var members = [];
    var buf = [];
    var i = startIdx || 0;
    var len = endIdx || str.length;
    var escaped = false;
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
                            var increment = (start > end) ? -1 : 1;
                            for (i = start; i != (end + increment); i += increment) {
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

var parseCharacterClass = function(content) {
    var buf = [];
    if (content[0] === "!") {
        buf.push("^");
        content = content.substring(0);
    }
    // escape backslashes and opening/closing brackets
    buf.push(content.replace(/([\\\[\]])/g, "\\$1"));
    return buf.join("");
};

var cartesian = function cartesian(list) {
    return getCartesianProduct(list, [], [], 0);
};

var getCartesianProduct = function(list, result, arr, idx) {
    var max = list.length - 1;
    for (let j=0, l=list[idx].length; j<l; j+=1) {
        let clone = arr.slice();
        clone.push(list[idx][j]);
        if (idx === max) {
            result.push(clone.join(""));
        } else {
            getCartesianProduct(list, result, clone, idx + 1);
        }
    }
    return result;
};

var expand = function(val) {
    if (typeof(val) === "object") {
        return expandSet(val);
    }
    return [val];
};

var expandSet = function(set) {
    var result = [];
    for each (let val in set.members) {
        Array.prototype.push.apply(result, expand(val).map(function(v) {
            return [set.prefix, v, set.suffix].join("");
        }));
    }
    return result;
};

var expandBraces = exports.expandBraces = function(pattern) {
    return cartesian(parseBrace(pattern).map(expand));
};

var escapeForRegex = function(buf) {
    if (buf.isRegExp === false) {
        buf.forEach(function(char, idx, arr) {
            if (isMetaChar(char)) {
                arr[idx] = "\\" + char;
            }
        });
        buf.isRegExp = true;
    }
};

var convertPattern = exports.convertPattern = function(pattern, options) {
    var buf = [];
    buf.isRegExp = false;
    // a leading "?" or "*" should not match a dot if options.dot is false
    if (!options.dot && ["*", "?"].indexOf(pattern.charAt(0)) != -1) {
        buf.isRegExp = true;
        buf.push("(?!\\.)");
    }
    var i = 0, j;
    var len = pattern.length;
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
        return new RegExp("^" + buf.join("") + "$");
    }
    return buf.join("");
};

var make = exports.make = function(pattern, options) {
    // phase 1: expand braces
    var patternSets = expandBraces(pattern);
    // phase 2: split into path segments and convert them regular expressions
    return patternSets.map(function(pattern) {
        return pattern.split(PATH_SPLIT).map(function(segment) {
            if (segment === "**") {
                return GLOBSTAR;
            }
            return convertPattern(segment, options);
        });
    });
};

var translate = exports.translate = function(pattern, options) {
    var isNegated = false;
    while (pattern.charAt(0) === "!") {
        isNegated = !isNegated;
        pattern = pattern.substring(1);
    }
    return {
        "patterns": make(pattern, options),
        "isNegated": isNegated
    };
};

var matchPattern = exports.matchPattern = function(segments, segmentIdx, patterns, patternIdx, options, partial) {
    var segmentsLen = segments.length;
    var patternsLen = patterns.length;
    while (segmentIdx < segmentsLen && patternIdx < patternsLen) {
        var segment = segments[segmentIdx];
        var pattern = patterns[patternIdx];
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
                if (matchPattern(segments, segmentRestIdx, patterns, patternRestIdx, options, partial)) {
                    // the rest of the pattern set matches the path segment rest
                    return true;
                } else {
                    // can't swallow "." or ".."
                    // can only swallow ".foo" when explicitly asked.
                    if (swallowed === "." || swallowed === ".." ||
                        (!options.dot && swallowed[0] === ".")) {
                        break;
                    }
                }
                segmentRestIdx += 1;
            }
            if (partial) {
                return segmentRestIdx === segmentsLen;
            }
            return false;
        } else if (!(pattern instanceof RegExp)) {
            if (segment !== pattern) {
                return false;
            }
        } else {
            let result = pattern.test(segment);
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
    } else if (segmentIdx === segmentsLen) {
        // pattern(s) left: it's ok if this is a part of a glob traversal
        return partial === true;
    } else if (patternIdx === patternsLen) {
        // path segments left: only ok if we stopped at the last segment of
        // a path with a trailing slash
        return segmentIdx === segmentsLen - 1 && segments[segmentIdx] === "";
    }
    throw new Error("Should never happen...");
};

exports.fnmatch = function(path, patternStr, options) {
    options || (options = {});
    var {patterns, isNegated} = translate(patternStr, options);
    var pathParts = path.split(PATH_SPLIT);
    var result = patterns.some(function(pattern) {
        return matchPattern(pathParts, 0, pattern, 0, options, false);
    });
    return result === !isNegated;
};

exports.filter = function(paths, patternStr, options) {
    options || (options = {});
    var {patterns, isNegated} = translate(patternStr, options);
    return paths.filter(function(path) {
        var pathParts = path.split(PATH_SPLIT);
        var result = patterns.some(function(pattern) {
            return matchPattern(pathParts, 0, pattern, 0, options, false);
        });
        return result === !isNegated;
    });
};