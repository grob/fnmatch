// http://hg.python.org/cpython/file/20e65501cfa4/Lib/test/test_fnmatch.py

var assert = require("assert");
var strings = require("ringo/utils/strings");

var {fnmatch, fnmatchcase} = require("../lib/fnmatch");

var execTest = function(func, filename, pattern, shouldMatch) {
    if (shouldMatch === false) {
        assert.isFalse(func(filename, pattern),
            strings.format("expected {} to not match {}", filename, pattern));
    } else {
        assert.isTrue(func(filename, pattern),
            strings.format("expected {} to match {}", filename, pattern));
    }
};

exports.testFnmatch = function() {
    var tests = [
        ['abc', 'abc'],
        ['abc', '?*?'],
        ['abc', '???*'],
        ['abc', '*???'],
        ['abc', '???'],
        ['abc', '*'],
        ['abc', 'ab[cd]'],
        ['abc', 'ab[!de]'],
        ['abc', 'ab[de]', false],
        ['abcef', 'ab[cd]ef'],
        ['a', '??', false],
        ['a', 'b', false],
        ['tmp/abc.js', '*.js'],

        // these test that '\' is handled correctly in character sets;
        // see SF bug #409651
        ['\\', '[\\]'],
        ['a', '[!\\]'],
        ['\\', '[!\\]', false],

        // test that filenames with newlines in them are handled correctly.
        // http://bugs.python.org/issue6665
        ['foo\nbar', 'foo*'],
        ['foo\nbar\n', 'foo*'],
        ['\nfoo', 'foo*', false],
        ['\n', '*']
    ];
    for each (let [filename, pattern, shouldMatch] in tests) {
        execTest(fnmatch, filename, pattern, shouldMatch !== false);
    }
};

exports.testFnmatchcase = function() {
    var tests = [
        ['AbC', 'abc', false, fnmatchcase],
        ['abc', 'AbC', false, fnmatchcase]
    ];
    for each (let [filename, pattern, shouldMatch] in tests) {
        execTest(fnmatchcase, filename, pattern, shouldMatch !== false);
    }
};