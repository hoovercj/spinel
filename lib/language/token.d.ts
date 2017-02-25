export declare namespace Token {
    interface IToken {
        Type: TokenKind;
        Value: string;
    }
    enum TokenKind {
        Operator = 0,
        Number = 1,
    }
}
