/// <reference path="../node_modules/@types/mocha/index.d.ts" />

import * as chai from 'chai';
import { Operator } from '../src/language/operator';
import { Token } from '../src/language/token';
import { Lexer } from '../src/lexer';

const expect = chai.expect;

describe('lexer', () => {
    it('should lex simple expressions', () => {
        const input = '1 + 2 / 3';
        const tokens: Token.IToken[] = [
             {Type: Token.TokenKind.Number, Value: '1' },
             {Type: Token.TokenKind.Operator, Value: '+' },
             {Type: Token.TokenKind.Number, Value: '2' },
             {Type: Token.TokenKind.Operator, Value: '/' },
             {Type: Token.TokenKind.Number, Value: '3' },
        ];

        expect(Lexer.tokenize(input)).to.deep.equal(tokens);
    });
});
