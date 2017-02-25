"use strict";
exports.__esModule = true;
var repl = require("repl");
var lexer_1 = require("./lexer");
function evaluate(input, context, filename, callback) {
    callback(null, JSON.stringify(lexer_1.Lexer.tokenize(input)));
}
repl.start({ prompt: '> ', eval: evaluate });
