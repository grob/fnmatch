var NUMSET_REGEXP = /(-?\d+)\.\.(-?\d+)/;

/**
 * Translates the pattern into a regular expression pattern
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
                    j = pattern.indexOf("]", i);
                    if (j === -1) {
                        buf.push("\\[");
                    } else {
                        let content = pattern.substring(i, j).replace("\\", "\\\\");
                        i = j + 1;
                        buf.push("[");
                        if (content[0] === "!") {
                            buf.push("^", content.substring(1));
                        } else {
                            buf.push(content);
                        }
                        buf.push("]");
                    }
                    break;
                case "{":
                    j = findClosingBracket(pattern, i);
                    let content = pattern.substring(i, j);
                    let match = content.match(NUMSET_REGEXP);
                    if (match !== null) {
                        buf.push(expandNumSet(parseInt(match[1], 10),
                            parseInt(match[2], 10)));
                    } else {
                        buf.push(expandBrace(content));
                    }
                    i = j + 1;
                    break;
                default:
                    buf.push(char.replace(/(\W)/, "\\$1"));
                    break;
            }
        } else {
            buf.push(char);
            escaped = false;
        }
    }
    return buf.join("");
};

var findClosingBracket = function(pattern, idx) {
    var lvl = 1;
    var len = pattern.length;

    do {
        let char = pattern[idx];
        if (char === "{") {
            lvl += 1;
        } else if (char === "}") {
            if ((lvl -= 1) === 0) {
                return idx;
            }
        }
    } while (idx++ < len);

    return -1;
};

var expandBrace = function(pattern) {
    var outerBuf = ["(?:(?:"];
    var i = 0;
    var len = pattern.length;
    var escaping = false;
    var innerBuf = [];
    while (i < len) {
        var char = pattern[i++];
        switch (char) {
            case "\\":
                escaping = true;
                break;
            case "{":
                if (innerBuf.length > 0) {
                    outerBuf.push(patternToRegex(innerBuf.join("")));
                    innerBuf.length = 0;
                }
                var j = findClosingBracket(pattern, i);
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
                escaping = false;
                break;
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
