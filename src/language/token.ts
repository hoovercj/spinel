export namespace Token {
    export interface IToken {
        Type: TokenKind;
        Value: string;
    }

    export enum TokenKind {
        Operator,
        Number,
    }
}
