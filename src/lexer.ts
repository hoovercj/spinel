import { Operator } from './language/operator';
import { Token } from './language/token';

export namespace Lexer {

    export function tokenize(input: string): Token.IToken[] {
        const tokens = input.trim().split(/\s+/).map((candidate) => {
            if (Operator.is(candidate)) {
                return { Type: Token.TokenKind.Operator, Value: candidate } as Token.IToken;
            } else if (!isNaN(Number(candidate))) {
                return { Type: Token.TokenKind.Number, Value: candidate } as Token.IToken;
            } else {
                throw new Error(`Unexpected token encountered: ${candidate}`);
            }
        });

        return tokens;
    }
}
