var NUMSET_REGEXP = /(-?\d+)\.\.(-?\d+)/;

/**
 * Translates the pattern into a regular expression pattern
 * @param {String} pattern The pattern
 * @param {String} pattern The pattern
 * @returns An object containing two properties:
 * - `source`: the regular expression pattern as string
 * - `isNegated`: a boolean indicating whether the pattern is negated or not
 */
var translate = exports.translate = function(pattern) {
    var isNegated = false;
    var len = pattern.length;
    for (var i=0; i<len && pattern[i] === "!"; i+=1) {
        isNegated = !isNegated;
    }
    return {
        "source": ["^", patternToRegex(pattern.substring(i)), "$"].join(""),
        "isNegated": isNegated
    };
};

/**
 * Tests if the pattern matches the filename passed as argument
 * @param {String} name The filename
 * @param {String} pattern The pattern
 * @returns {boolean} True if the pattern matches
 */
var fnmatch = exports.fnmatch = function(name, pattern) {
    var {source, isNegated} = translate(pattern);
    return (new RegExp(source, "i")).test(name) === !isNegated;
};

/**
 * Tests if the pattern case-sensitive matches the filename passed as argument
 * @param {String} name The filename
 * @param {String} pattern The pattern
 * @returns {boolean} True if the pattern matches
 */
exports.fnmatchcase = function(name, pattern) {
    var {source, isNegated} = translate(pattern);
    return (new RegExp(source)).test(name) === !isNegated;
};

/**
 * Returns the filenames that match the pattern passed as argument
 * @param {Array} names An array containing the file names
 * @param {String} pattern The pattern
 * @returns {Array} An array containing the matching filenames
 */
exports.filter = function(names, pattern) {
    return [name for each (name in names) if (fnmatch(name, pattern) === true)];
};

var patternToRegex = function(pattern) {
    var buf = [];
    var i = 0, j;
    var len = pattern.length;
    var escaped = false;
    while (i < len) {
        let char = pattern[i++];
        if (char === "\\") {
            escaped = true;
            buf.push("\\");
        } else if (!escaped) {
            switch (char) {
                case "*":
                    buf.push("[\\s\\S]*");
                    break;
                case "?":
                    buf.push("[\\s\\S]");
                    break;
                case "[":
                    j = findClosingBracket(pattern, i);
                    if (j === -1) {
                        // no closing bracket found - interpret as literal
                        buf.push("\\[");
                    } else {
                        buf.push("[", parseCharacterClass(pattern.substring(i, j)), "]");
                        i = j + 1;
                    }
                    break;
                case "{":
                    j = findClosingBrace(pattern, i);
                    if (j === -1) {
                        // no closing bracket found - interpret as literal
                        buf.push("\\{");
                    } else {
                        buf.push(parseBrace(pattern.substring(i, j)));
                        i = j + 1;
                    }
                    break;
                default:
                    buf.push(char.replace(/(\W)/g, "\\$1"));
                    break;
            }
        } else {
            buf.push(char);
            escaped = false;
        }
    }
    return buf.join("");
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
        if (char === "]" && i > idx) {
            return i;
        }
        i += 1;
    }
    return -1;
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

var parseBrace = function(content) {
    let match = content.match(NUMSET_REGEXP);
    if (match !== null) {
        return (expandNumSet(parseInt(match[1], 10), parseInt(match[2], 10)));
    }
    return expandBrace(content);
};

var expandBrace = function(pattern) {
    var outerBuf = ["(?:(?:"];
    var i = 0;
    var len = pattern.length;
    var escaped = false;
    var innerBuf = [];
    while (i < len) {
        var char = pattern[i++];
        if (char === "\\") {
            escaped = true;
            innerBuf.push("\\");
        } else if (!escaped) {
            switch (char) {
                case "{":
                    if (innerBuf.length > 0) {
                        outerBuf.push(patternToRegex(innerBuf.join("")));
                        innerBuf.length = 0;
                    }
                    var j = findClosingBrace(pattern, i);
                    outerBuf.push(expandBrace(pattern.substring(i, j)));
                    i = j + 1;
                    break;
                case ",":
                    if (innerBuf.length > 0) {
                        outerBuf.push(patternToRegex(innerBuf.join("")));
                        innerBuf.length = 0;
                    }
                    outerBuf.push(")|(?:");
                    break;
                default:
                    innerBuf.push(char);
                    escaped = false;
                    break;
            }
        } else {
            innerBuf.push(char);
            escaped = false;
        }
    }
    if (innerBuf.length > 0) {
        outerBuf.push(patternToRegex(innerBuf.join("")));
    }
    outerBuf.push("))");
    return outerBuf.join("");
};

var expandNumSet = function(from, to) {
    return "(?:" + [i for (i in new Range(from, to))].join("|") + ")";
};

var Range = function(from, to) {
    for (let i=from; i<=to; i+=1) {
        yield i;
    }
};
