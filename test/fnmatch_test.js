const assert = require("assert");
const system = require("system");
const strings = require("ringo/utils/strings");

const {matches, expandBraces} = require("../lib/fnmatch");

const exec = (pattern, input, expected, options) => {
    const actual = input.filter(function(path) {
        try {
            return matches(path, pattern, options);
        } catch (e) {
            assert.fail(e);
        }
    });
    assert.deepEqual(actual.sort(), expected.sort(),
        strings.format("expected {} to match {} {}", pattern, expected,
                (options || {}).toSource()));
};

exports.testExpandBraces = () => {
    assert.deepEqual(expandBraces('{'), ['\\{']);
    assert.deepEqual(expandBraces(',b'), [',b']);
    assert.deepEqual(expandBraces('a,b'), ['a,b']);
    assert.deepEqual(expandBraces('{a\\{b}'), ['\\{a\\{b\\}']);
    assert.deepEqual(expandBraces('{a\\{b,c}'), ['a\\{b', 'c']);
    assert.deepEqual(expandBraces('{a*}'), ['\\{a*\\}']);
    assert.deepEqual(expandBraces('{a\\,b}'), ['\\{a\\,b\\}']);
    assert.deepEqual(expandBraces('{x*,a*}'), ['x*', 'a*']);
    assert.deepEqual(expandBraces("a{}b"), ["a\\{\\}b"]);
    assert.deepEqual(expandBraces("a{{b,c"), ["a\\{\\{b,c"]);
    assert.deepEqual(expandBraces("a{{}b,c}"), ["a\\{\\}b", "ac"]);
    assert.deepEqual(expandBraces("a{b,c"), ["a\\{b,c"]);
    assert.deepEqual(expandBraces('a{{b,c}'), ['a\\{b', 'a\\{c']);
    assert.deepEqual(expandBraces('a{{{b,c}'), ['a\\{\\{b', 'a\\{\\{c']);
    assert.deepEqual(expandBraces('a{{b,c}}d'), ['a\\{b\\}d', 'a\\{c\\}d']);
    assert.deepEqual(expandBraces('a{b,c{d,e},{f,g}h}x{y,z}'), [
        'abxy', 'abxz', 'acdxy', 'acdxz', 'acexy',
        'acexz', 'afhxy', 'afhxz', 'aghxy', 'aghxz'
    ]);
    assert.deepEqual(expandBraces("a{1.5}b"), ["a\\{1.5\\}b"]);
    assert.deepEqual(expandBraces('a{1..5}b'), [
        'a1b', 'a2b', 'a3b', 'a4b', 'a5b'
    ]);
};

exports.testFnmatch = () => {
    const tests = [
        {
            "pattern": "abc",
            "input": ["a", "ab", "abc", "abcd"],
            "expected": ["abc"]
        },
        {
            "pattern": "??",
            "input": ["a", "aa", "aaa"],
            "expected": ["aa"]
        },
        {
            "pattern": "?*?",
            "input": ["a", "b", "c", "d", "abc", "abd", "abe", "bb", "bcd",
                "ca", "cb", "dd", "de", "Beware", "bdir/"],
            "expected": ["abc", "abd", "abe", "bb", "bcd", "ca", "cb", "dd",
                "de", "Beware", "bdir/"]
        },
        {
            "pattern": "???*",
            "input": ["ab", "abc", "abdx"],
            "expected": ["abc", "abdx"]
        },
        {
            "pattern": "*???",
            "input": ["ab", "abc", "abdx"],
            "expected": ["abc", "abdx"]
        },
        {
            "pattern": "???",
            "input": ["ab", "abc", "abdx"],
            "expected": ["abc"]
        },
        // ? matches a dot if not at the beginning of a file name
        {
            "pattern": "???",
            "input": ["a.", "a.b", "a.b.c"],
            "expected": ["a.b"]
        },
        {
            "pattern": "*",
            "input": ["a", "bc", "bdir/", "bdir/x"],
            "expected": ["a", "bc", "bdir/", "bdir/x"]
        },
        {
            "pattern": "a*",
            "input": ["a", "abc", "abd", "Abe", "xyz"],
            "expected": ["a", "abc", "abd"]
        },
        {
            "pattern": "ab[cd]",
            "input": ["ab", "abc", "abd", "abx"],
            "expected": ["abc", "abd"]
        },
        {
            "pattern": "ab[!de]",
            "input": ["abc", "abd", "abe", "abx"],
            "expected": ["abc", "abx"]
        },
        {
            "pattern": "ab[cd]ef",
            "input": ["abef", "abcef", "abdef", "abeef"],
            "expected": ["abcef", "abdef"]
        },
        // * matches a dot if not at the beginning of a file name
        {
            "pattern": "*.js",
            "input": ["a.js", "ab.js", "a.b.js", "ab.jsp"],
            "expected": ["a.js", "ab.js", "a.b.js"]
        },
        {
            "pattern": "\\*",
            "input": ["*", "a"],
            "expected": ["*"]
        },
        {
            "pattern": "\\**",
            "input": ["*", "*a", "**", "**a", "***"],
            "expected": ["*", "*a", "**", "**a", "***"]
        },
        {
            "pattern": "\\*\\*",
            "input": ["*", "*a", "**", "**a", "***"],
            "expected": ["**"]
        },
        {
            "pattern": "b*/",
            "input": ["a", "b", "bdir/", "bdir/c", "c", "cdir/"],
            "expected": ["bdir/"]
        },
        // a trailing asterisk should not match the empty string
        {
            "pattern": "a/*",
            "input": ["a", "a/", "a/b"],
            "expected": ["a/b"]
        },

        // leading period should not be matched by * or ? ...
        {
            "pattern": "?",
            "input": [".", ".a", "a/"],
            "expected": ["a/"]
        },
        {
            "pattern": "??",
            "input": ["..", ".a", "ab"],
            "expected": ["ab"]
        },
        {
            "pattern": "a/?",
            "input": ["a", "a/.", "a/b"],
            "expected": ["a/b"]
        },
        {
            "pattern": "a/??",
            "input": ["a", "a/.b", "a/bc"],
            "expected": ["a/bc"]
        },
        {
            "pattern": "*",
            "input": [".", ".a", ".a/", ".a/b", "..", "..a", "../a", "a", "a.b"],
            "expected": ["../a", ".a/b", "a", "a.b"]
        },
        {
            "pattern": "a/*",
            "input": ["a", "b/", "a/.b", "a/..b", "a/b"],
            "expected": ["a/b"]
        },
        // ... unless dot = true
        {
            "pattern": "?",
            "input": [".", ".a", "a/"],
            "expected": [".", "a/"],
            "options": {"dot": true}
        },
        {
            "pattern": "??",
            "input": ["..", ".a", "ab"],
            "expected": ["..", ".a", "ab"],
            "options": {"dot": true}
        },
        {
            "pattern": "a/?",
            "input": ["a", "a/.", "a/b"],
            "expected": ["a/.", "a/b"],
            "options": {"dot": true}
        },
        {
            "pattern": "a/??",
            "input": ["a", "a/.b", "a/bc"],
            "expected": ["a/.b", "a/bc"],
            "options": {"dot": true}
        },
        {
            "pattern": "*",
            "input": [".", ".a", ".a/", ".a/b", "..", "..a", "../a", "a", "a.b"],
            "expected": [".", ".a", ".a/", ".a/b", "..", "..a", "../a", "a", "a.b"],
            "options": {"dot": true}
        },
        {
            "pattern": "a/*",
            "input": ["a", "b/", "a/.b", "a/..b", "a/b"],
            "expected": ["a/.b", "a/..b", "a/b"],
            "options": {"dot": true}
        },

        // these test that "\" is handled correctly in character sets;
        // see SF bug #409651
        {
            "pattern": "[\\]",
            "input": ["\\", "a"],
            "expected": ["\\"]
        },
        {
            "pattern": "[!\\]",
            "input": ["\\", "a"],
            "expected": ["a"]
        },

        // test that filenames with newlines in them are handled correctly.
        // http://bugs.python.org/issue6665
        {
            "pattern": "foo*",
            "input": ["foo", "\nfoo", "foo\nbar", "foo\nbar\n", "foobar"],
            "expected": ["foo", "foo\nbar", "foo\nbar\n", "foobar"]
        },
        {
            "pattern": "*",
            "input": ["\n"],
            "expected": ["\n"]
        },

        // tests for character classes
        {
            "pattern": "a[bc",
            "input": ["ab", "ac", "a[bc", "abc"],
            "expected": ["a[bc"]
        },
        {
            "pattern": "[a-c]b*",
            "input": ["ab", "abc", "abd", "bb", "cb", "ac", "acb"],
            "expected": ["ab", "abc", "abd", "bb", "cb"]
        },
        {
            "pattern": "[a-y]*[^c]",
            "input": ["a", "ab", "ac", "abd", "bb", "bcd", "bdir/", "ca.", "cb", "dd", "de"],
            "expected": ["ab", "abd", "bb", "bcd", "bdir/", "ca.", "cb", "dd", "de"]
        },
        {
            "pattern": "a*[^c]",
            "input": ["ab", "ac", "abc", "abd"],
            "expected": ["ab", "abd"]
        },
        {
            "pattern": "a[X-]b",
            "input": ["ab", "aab", "a-b", "aXb"],
            "expected": ["a-b", "aXb"]
        },
        {
            "pattern": "[^a-c]*",
            "input": ["a", "ab", "d", "da"],
            "expected": ["d", "da"]
        },
        {
            "pattern": "a\\*b/*",
            "input": ["a*b", "acb", "acb/d", "a*b/", "a*b/ooo"],
            "expected": ["a*b/ooo"]
        },
        {
            "pattern": "a\\*?/*",
            "input": ["a*c", "abc", "a*c/", "a*c/ooo"],
            "expected": ["a*c/ooo"]
        },
        {
            "pattern": "a[\\b]c",
            "input": ["a\\bc", "abc"],
            "expected": ["abc"]
        },
        {
            "pattern": "a[\\.]c",
            "input": ["a\\.c", "abc", "a.c"],
            "expected": ["a.c"]
        },

        // POSIX.2 2.8.3.2: a right bracket shall lose its special meaning and
        // represent itself in a bracket expression if it occurs first in the list.
        {
            "pattern": "[]]b",
            "input": ["ab", "b", "]b"],
            "expected": ["]b"]
        },
        {
            "pattern": "[]-]",
            "input": ["a", "]", "-"],
            "expected": ["]", "-"]
        },
        {
            "pattern": "[a-\z]",
            "input": ["\\z", "\z", "p"],
            "expected": ["\z", "p"]
        },
        {
            "pattern": "[[]b",
            "input": ["ab", "b", "[b"],
            "expected": ["[b"]
        },
        {
            "pattern": "[[a]b",
            "input": ["a", "[b", "ab", "bb"],
            "expected": ["[b", "ab"]
        },
        {
            "pattern": "[]a[]b",
            "input": ["b", "]b", "ab", "[b", "bb"],
            "expected": ["]b", "ab", "[b"]
        },
        {
            "pattern": "[][!]",
            "input": ["a", "!", "]", "["],
            "expected": ["!", "]", "["]
        },
        {
            "pattern": "[*",
            "input": ["[", "[abc", "]", "a"],
            "expected": ["[", "[abc"]
        },

        // tests for {<pattern>,<pattern>[..]}
        {
            "pattern": '{',
            "input": ['{'],
            "expected": ["{"]
        },
        {
            "pattern": '{a*,x}',
            "input": ["a", "ab", "abc", "x", "xy"],
            "expected": ["a", "ab", "abc", "x"]
        },
        {
            "pattern": "{x,a*}",
            "input": ["a", "ab", "abc", "x", "xy"],
            "expected": ["a", "ab", "abc", "x"]
        },
        {
            "pattern": "{?b?,?x?}",
            "input": ["a", "ab", "abc", "axc", "ayc"],
            "expected": ["abc", "axc"]
        },
        {
            "pattern": "{*c,*x}",
            "input": ["c", "ac", "abc", "x", "ax", "axy"],
            "expected": ["c", "ac", "abc", "x", "ax"]
        },
        {
            "pattern": "{a\\*,x}",
            "input": ["a", "ab", "a*", "x", "xy"],
            "expected": ["a*", "x"]
        },
        {
            "pattern": "{a\\{b,x}",
            "input": ["ab", "ax", "a{b", "x", "xy"],
            "expected": ["a{b", "x"]
        },
        {
            "pattern": "a{b,c{d,e},{f,g}h}x{y,z}",
            "input": [
                'abxy', 'abxz', 'acdxy', 'acdxz', 'acexy',
                'acexz', 'afhxy', 'afhxz', 'aghxy', 'aghxz'
            ],
            "expected": [
                'abxy', 'abxz', 'acdxy', 'acdxz', 'acexy',
                'acexz', 'afhxy', 'afhxz', 'aghxy', 'aghxz'
            ]
        },
        {
            "pattern": "a{1..5}b",
            "input": ["ab", 'a1b', 'a2b', 'a3b', 'a4b', 'a5b', "a6b"],
            "expected": ['a1b', 'a2b', 'a3b', 'a4b', 'a5b']
        },

        // negations
        {
            "pattern": "!a*",
            "input": ["a", "ab", "\\!a", "d", "!ab", "!abc"],
            "expected": ["\\!a", "d", "!ab", "!abc"]
        },
        {
            "pattern": "!!a*",
            "input": ["a", "ab", "a!b", "x", "xy"],
            "expected": ["a", "ab", "a!b"]
        },
        {
            "pattern": "!\\!a*",
            "input": ["!a", "!ab", "a!b", "b", "\\!a"],
            "expected": ["a!b", "b", "\\!a"]
        },

        // http://www.opensource.apple.com/source/bash/bash-23/bash/tests/glob-test
        {
            "pattern": "a***c",
            "input": ["a", "ab", "ac", "abc"],
            "expected": ["ac", "abc"]
        },
        {
            "pattern": "*/man*/bash.*",
            "input": ["man/man/bashrc", "man/man/bash.1", "man/man1/bash.1"],
            "expected": ["man/man/bash.1", "man/man1/bash.1"]
        },
        {
            "pattern": "man/man1/bash.1",
            "input": ["man/man/bash.1", "man1/man/bash.1", "man/man1/bash.1", "man/man1/bashr1"],
            "expected": ["man/man1/bash.1"]
        },
        {
            "pattern": "a*****?c",
            "input": ["ac", "abc", "abxc"],
            "expected": ["abc", "abxc"]
        },
        {
            "pattern": "?*****??",
            "input": ["ab", "abc", "abxyz"],
            "expected": ["abc", "abxyz"]
        },
        {
            "pattern": "*****??",
            "input": ["a", "ab", "abc", "abxy"],
            "expected": ["ab", "abc", "abxy"]
        },
        {
            "pattern": "?*****?c",
            "input": ["c", "ac", "abc", "abxyc"],
            "expected": ["abc", "abxyc"]
        },
        {
            "pattern": "?***?****c",
            "input": ["a", "ac", "abc", "axbyc"],
            "expected": ["abc", "axbyc"]
        },
        {
            "pattern": "?***?****?",
            "input": ["a", "ab", "abc", "axbycz"],
            "expected": ["abc", "axbycz"]
        },
        {
            "pattern": "?***?****",
            "input": ["a", "ab", "abc", "abcd"],
            "expected": ["ab", "abc", "abcd"]
        },
        {
            "pattern": "*******c",
            "input": ["a", "c", "bc", "abc", "abcd"],
            "expected": ["c", "bc", "abc"]
        },
        {
            "pattern": "*******?",
            "input": ["", "c", "bc", "abc"],
            "expected": ["c", "bc", "abc"]
        },
        {
            "pattern": "a*cd**?**??k",
            "input": ["a", "acd", "acde", "acdef", "acdefg", "abcdecdhjk"],
            "expected": ["abcdecdhjk"]
        },
        {
            "pattern": "a**?**cd**?**??k",
            "input": ["a", "ab", "abc", "abcd", "abcde", "abcdef", "abcdefg", "abcdecdhjk"],
            "expected": ["abcdecdhjk"]
        },
        {
            "pattern": "a**?**cd**?**??k***",
            "input": ["a", "ab", "abc", "abcd", "abcde", "abcdef", "abcdefg", "abcdecdhjk", "abcdecdhjki"],
            "expected": ["abcdecdhjk", "abcdecdhjki"]
        },
        {
            "pattern": "a**?**cd**?**??***k",
            "input": ["abcdecdhjk"],
            "expected": ["abcdecdhjk"]
        },
        {
            "pattern": "a**?**cd**?**??***k**",
            "input": ["abcdecdhjk"],
            "expected": ["abcdecdhjk"]
        },
        {
            "pattern": "a****c**?**??*****",
            "input": ["abcdecdhjk"],
            "expected": ["abcdecdhjk"]
        },
        {
            "pattern": "[-abc]",
            "input": ["-", "a", "b", "c", "d", "dx"],
            "expected": ["-", "a", "b", "c"]
        },
        {
            "pattern": "[abc-]",
            "input": ["-", "a", "b", "c", "d", "dx"],
            "expected": ["-", "a", "b", "c"]
        },
        {
            "pattern": "[\\\\]",
            "input": ["a", "\\"],
            "expected": ["\\"]
        },

        // globstar
        {
            "pattern": "**",
            "input": ["a", "a/", "a/b", "a/b/", "a/b/c", "a/b/c/"],
            "expected": ["a", "a/", "a/b", "a/b/", "a/b/c", "a/b/c/"]
        },
        {
            "pattern": "**/*",
            "input": ["a", "a/", "a/b", "a/b/", "a/b/c", "a/b/c/"],
            "expected": ["a/b", "a/b/"],
            "options": {"globstar": false}
        },
        {
            // a trailing slash matches only directories
            "pattern": "**/",
            "input": ["a", "a/", "a/b", "a/b/", "a/b/c", "a/b/c/"],
            "expected": ["a/", "a/b/", "a/b/c/"]
        },
        {
            "pattern": "a/**",
            "input": ["a", "a/", "a/b", "a/b/", "a/b/c", "a/b/c/"],
            "expected": ["a/", "a/b", "a/b/", "a/b/c", "a/b/c/"]
        },
        {
            "pattern": "a/**/b/**/c",
            "input": ["a", "a/", "a/b", "a/b/c", "a/b/x/y/z/c", "a/x/y/z/b/c", "a/b/x/b/x/c"],
            "expected": ["a/b/c", "a/b/x/y/z/c", "a/x/y/z/b/c", "a/b/x/b/x/c"]
        },

        // ** never matches . and ..
        {
            "pattern": "a/**",
            "input": ["a/./c", "a/../c", "a/.b/c", "a/b/.c"],
            "expected": []
        },
        // and files/dirs with a leading dot only if dot = true
        {
            "pattern": "a/**",
            "input": ["a/./c", "a/../c", "a/.b/c", "a/b/.c"],
            "expected": ["a/.b/c", "a/b/.c"],
            "options": {"dot": true}
        },
        {
            "pattern": "a/.*/c",
            "input": ["a/./c", "a/../c", "a/.b/c"],
            "expected": ["a/./c", "a/../c", "a/.b/c"]
        },
        {
            "pattern": "a/**/b",
            "input": ["a/.x/b", "a/x/.b", "a/c/b"],
            "expected": ["a/c/b"]
        },
        {
            "pattern": "a/**/b",
            "input": ["a/.x/b", "a/x/.b", "a/c/b"],
            "expected": ["a/.x/b", "a/c/b"],
            "options": {"dot": true}
        },
        // ignoreCase
        {
            "pattern": "a",
            "input": ["A"],
            "expected": ["A"],
            "options": {"ignoreCase": true}
        },
        {
            "pattern": "a*",
            "input": ["a", "ab", "aB", "Ab", "AB"],
            "expected": ["a", "ab", "aB", "Ab", "AB"],
            "options": {"ignoreCase": true}
        },
        {
            "pattern": "a/a?",
            "input": ["a/aA", "A/Aa", "A/Ba"],
            "expected": ["a/aA", "A/Aa"],
            "options": {"ignoreCase": true}
        }
    ];

    tests.forEach(test => {
        exec(test.pattern, test.input, test.expected, test.options);
    });
};

if (require.main == module.id) {
    system.exit(require("test").run.apply(null,
            [exports].concat(system.args.slice(1))));
}
