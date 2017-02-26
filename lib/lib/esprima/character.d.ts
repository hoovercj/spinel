export declare const Character: {
    fromCodePoint(cp: number): string;
    isWhiteSpace(cp: number): boolean;
    isLineTerminator(cp: number): boolean;
    isIdentifierStart(cp: number): boolean;
    isIdentifierPart(cp: number): boolean;
    isDecimalDigit(cp: number): boolean;
    isHexDigit(cp: number): boolean;
    isOctalDigit(cp: number): boolean;
};
