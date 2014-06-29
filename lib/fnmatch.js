var fnmatch = exports.fnmatch = function(name, pattern) {
    var re = new RegExp(translate(pattern), "i");
    return re.test(name);
};

exports.fnmatchcase = function(name, pattern) {
    var re = new RegExp(translate(pattern));
    return re.test(name);
};

var translate = exports.translate = function(pattern) {
    var i = 0;
    var len = pattern.length;
    var buf = ["^"];
    while (i < len) {
        let char = pattern.charAt(i++);
        switch (char) {
            case "*":
                buf.push("[\\s\\S]*");
                break;
            case "?":
                buf.push("[\\s\\S]");
                break;
            case "[":
                let j = pattern.indexOf("]", i);
                if (j === -1) {
                    buf.push("\\[");
                } else {
                    let  stuff = pattern.substring(i, j).replace("\\", "\\\\");
                    i = j + 1;
                    buf.push("[");
                    if (stuff.charAt(0) === "!") {
                        buf.push("^", stuff.substring(1));
                    } else if (stuff.charAt(0) === "^") {
                        buf.push("\\", stuff);
                    } else {
                        buf.push(stuff);
                    }
                    buf.push("]");
                }
                break;
            default:
                buf.push(char.replace(/(\W)/, "\\$1"));
                break;
        }
    }
    buf.push("$");
    return buf.join("");
};

exports.filter = function(names, pattern) {
    return [name for each (name in names) if (fnmatch(name, pattern) === true)];
};