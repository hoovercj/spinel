import { Token } from './language/token';
export declare namespace Lexer {
    function tokenize(input: string): Token.IToken[];
}
