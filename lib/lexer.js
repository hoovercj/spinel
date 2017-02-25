"use strict";
exports.__esModule = true;
var operator_1 = require("./language/operator");
var token_1 = require("./language/token");
var Lexer;
(function (Lexer) {
    function tokenize(input) {
        var tokens = input.trim().split(/\s+/).map(function (candidate) {
            if (operator_1.Operator.is(candidate)) {
                return { Type: token_1.Token.TokenKind.Operator, Value: candidate };
            }
            else if (!isNaN(Number(candidate))) {
                return { Type: token_1.Token.TokenKind.Number, Value: candidate };
            }
            else {
                throw new Error("Unexpected token encountered: " + candidate);
            }
        });
        return tokens;
    }
    Lexer.tokenize = tokenize;
})(Lexer = exports.Lexer || (exports.Lexer = {}));
