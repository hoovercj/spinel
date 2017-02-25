import * as repl from 'repl';
import { Lexer } from './lexer';

function evaluate(input: any, context: any, filename: any, callback: any) {
    callback(null, JSON.stringify(Lexer.tokenize(input)));
}

repl.start({prompt: '> ', eval: evaluate});
