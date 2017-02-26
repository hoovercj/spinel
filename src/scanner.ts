import { assert } from './lib/esprima/assert';
import { Character } from './lib/esprima/character';
import { ErrorHandler } from './lib/esprima/error-handler';
import { Messages } from './lib/esprima/messages';
import { Token } from './lib/esprima/token';

function hexValue(ch: string): number {
    return '0123456789abcdef'.indexOf(ch.toLowerCase());
}

function octalValue(ch: string): number {
    return '01234567'.indexOf(ch);
}

export interface Position {
    line: number;
    column: number;
}

export interface SourceLocation {
    start: Position;
    end: Position;
    source?: string;
}

export interface Comment {
    multiLine: boolean;
    slice: number[];
    range: [number, number];
    loc: SourceLocation;
}

export interface RawToken {
    type: Token;
    value: string | number;
    pattern?: string;
    flags?: string;
    regex?: RegExp | null;
    octal?: boolean;
    cooked?: string;
    head?: boolean;
    tail?: boolean;
    lineNumber: number;
    lineStart: number;
    start: number;
    end: number;
}

export interface ScannerState {
    index: number;
    lineNumber: number;
    lineStart: number;
}

export class Scanner {
    public readonly source: string;
    public readonly errorHandler: ErrorHandler;
    public trackComment: boolean;

    public index: number;
    public lineNumber: number;
    public lineStart: number;
    public curlyStack: string[];

    private readonly length: number;

    constructor(code: string, handler: ErrorHandler) {
        this.source = code;
        this.errorHandler = handler;
        this.trackComment = false;

        this.length = code.length;
        this.index = 0;
        this.lineNumber = (code.length > 0) ? 1 : 0;
        this.lineStart = 0;
        this.curlyStack = [];
    }

    // TODO: Why doesn't this include curly stack?
    public saveState(): ScannerState {
        return {
            index: this.index,
            lineNumber: this.lineNumber,
            lineStart: this.lineStart
        };
    }

    public restoreState(state: ScannerState): void {
        this.index = state.index;
        this.lineNumber = state.lineNumber;
        this.lineStart = state.lineStart;
    }

    public eof(): boolean {
        return this.index >= this.length;
    }

    public scanComments(): Comment[] {
        let comments = [] as Comment[];

        let start = (this.index === 0);
        while (!this.eof()) {
            let ch = this.source.charCodeAt(this.index);

            if (Character.isWhiteSpace(ch)) {
                this.index++;
            } else if (Character.isLineTerminator(ch)) {
                this.index++;
                // If the char was a new line and the next char is a carriage return, advance index again
                if (ch === 0x0D /* \n */ && this.source.charCodeAt(this.index) === 0x0A /* \r */) {
                    this.index++;
                }
                this.lineNumber++;
                this.lineStart = this.index;
                start = true;
            } else if (ch === 0x2F) { // U+002F is '/'
                ch = this.source.charCodeAt(this.index + 1);
                if (ch === 0x2F) {
                    this.index += 2;
                    const comment = this.skipSingleLineComment(2);
                    if (this.trackComment) {
                        comments = comments.concat(comment);
                    }
                    start = true;
                // Multiline comments are unsupported for now
                // } else if (ch === 0x2A) {  // U+002A is '*'
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        return comments;
    }

    public lex(): RawToken {
        if (this.eof()) {
            return {
                type: Token.EOF,
                value: '',
                lineNumber: this.lineNumber,
                lineStart: this.lineStart,
                start: this.index,
                end: this.index
            };
        }

        const cp = this.source.charCodeAt(this.index);

        if (Character.isIdentifierStart(cp)) {
            return this.scanIdentifier();
        }

        // Very common: ( and ) and ;
        if (cp === 0x28 || cp === 0x29 || cp === 0x3B) {
            return this.scanPunctuator();
        }

        // String literal starts with single quote (U+0027) or double quote (U+0022).
        if (cp === 0x27 || cp === 0x22) {
            return this.scanStringLiteral();
        }

        // Dot (.) U+002E can also start a floating-point number, hence the need
        // to check the next character.
        if (cp === 0x2E) {
            if (Character.isDecimalDigit(this.source.charCodeAt(this.index + 1))) {
                return this.scanNumericLiteral();
            }
            return this.scanPunctuator();
        }

        if (Character.isDecimalDigit(cp)) {
            return this.scanNumericLiteral();
        }

        // Possible identifier start in a surrogate pair.
        if (cp >= 0xD800 && cp < 0xDFFF) {
            if (Character.isIdentifierStart(this.codePointAt(this.index))) {
                return this.scanIdentifier();
            }
        }

        return this.scanPunctuator();
    }

    private throwUnexpectedToken(message = Messages.UnexpectedTokenIllegal): never {
        return this.errorHandler.throwError(this.index, this.lineNumber,
            this.index - this.lineStart + 1, message);
    }

    private tolerateUnexpectedToken(message = Messages.UnexpectedTokenIllegal) {
        this.errorHandler.tolerateError(this.index, this.lineNumber,
            this.index - this.lineStart + 1, message);
    }

    private scanHexEscape(prefix: string): string | null {
        const len = (prefix === 'u') ? 4 : 2;
        let code = 0;

        for (let i = 0; i < len; ++i) {
            if (!this.eof() && Character.isHexDigit(this.source.charCodeAt(this.index))) {
                code = code * 16 + hexValue(this.source[this.index++]);
            } else {
                return null;
            }
        }
        return String.fromCharCode(code);
    }

    private scanUnicodeCodePointEscape(): string {
        let ch = this.source[this.index];
        let code = 0;

        // At least, one hex digit is required.
        if (ch === '}') {
            this.throwUnexpectedToken();
        }

        while (!this.eof()) {
            ch = this.source[this.index++];
            if (!Character.isHexDigit(ch.charCodeAt(0))) {
                break;
            }
            code = code * 16 + hexValue(ch);
        }

        if (code > 0x10FFFF || ch !== '}') {
            this.throwUnexpectedToken();
        }

        return Character.fromCodePoint(code);
    }

    private getIdentifier(): string {
        const start = this.index++;
        while (!this.eof()) {
            const ch = this.source.charCodeAt(this.index);
            if (ch === 0x5C) {
                // Blackslash (U+005C) marks Unicode escape sequence.
                this.index = start;
                return this.getComplexIdentifier();
            } else if (ch >= 0xD800 && ch < 0xDFFF) {
                // Need to handle surrogate pairs.
                this.index = start;
                return this.getComplexIdentifier();
            }

            if (Character.isIdentifierPart(ch)) {
                ++this.index;
            } else {
                break;
            }
        }

        return this.source.slice(start, this.index);
    }

    private getComplexIdentifier(): string {
        let cp = this.codePointAt(this.index);
        let id = Character.fromCodePoint(cp);
        this.index += id.length;

        // '\u' (U+005C, U+0075) denotes an escaped character.
        let ch;
        if (cp === 0x5C) {
            if (this.source.charCodeAt(this.index) !== 0x75) {
                this.throwUnexpectedToken();
            }
            ++this.index;
            if (this.source[this.index] === '{') {
                ++this.index;
                ch = this.scanUnicodeCodePointEscape();
            } else {
                ch = this.scanHexEscape('u');
                if (ch === null || ch === '\\' || !Character.isIdentifierStart(ch.charCodeAt(0))) {
                    this.throwUnexpectedToken();
                }
            }
            id = ch;
        }

        while (!this.eof()) {
            cp = this.codePointAt(this.index);
            if (!Character.isIdentifierPart(cp)) {
                break;
            }
            ch = Character.fromCodePoint(cp);
            id += ch;
            this.index += ch.length;

            // '\u' (U+005C, U+0075) denotes an escaped character.
            if (cp === 0x5C) {
                id = id.substr(0, id.length - 1);
                if (this.source.charCodeAt(this.index) !== 0x75) {
                    this.throwUnexpectedToken();
                }
                ++this.index;
                if (this.source[this.index] === '{') {
                    ++this.index;
                    ch = this.scanUnicodeCodePointEscape();
                } else {
                    ch = this.scanHexEscape('u');
                    if (ch === null || ch === '\\' || !Character.isIdentifierPart(ch.charCodeAt(0))) {
                        this.throwUnexpectedToken();
                    }
                }
                id += ch;
            }
        }

        return id;
    }

    private isKeyword(id: string): boolean {
        switch (id.length) {
            case 2:
                return (id === 'if') || (id === 'do');
            case 3:
                return (id === 'def') || (id === 'end') || (id === 'for') || (id === 'let');
            case 4:
                return (id === 'else');
            case 5:
                return (id === 'while') || (id === 'break') || (id === 'const');
            case 6:
                return (id === 'return');
            case 7:
                return (id === 'default') || (id === 'finally') || (id === 'extends');
            case 8:
                return (id === 'function') || (id === 'continue') || (id === 'debugger');
            case 9:
                return false;
            case 10:
                return (id === 'instanceof');
            default:
                return false;
        }
    }

    private scanIdentifier(): RawToken {
        let type: Token;
        const start = this.index;

        // Backslash (U+005C) starts an escaped character.
        const id = (this.source.charCodeAt(start) === 0x5C) ? this.getComplexIdentifier() : this.getIdentifier();

        // There is no keyword or literal with only one character.
        // Thus, it must be an identifier.
        if (id.length === 1) {
            type = Token.Identifier;
        } else if (this.isKeyword(id)) {
            type = Token.Keyword;
        } else if (id === 'null') {
            type = Token.NullLiteral;
        } else if (id === 'true' || id === 'false') {
            type = Token.BooleanLiteral;
        } else {
            type = Token.Identifier;
        }

        // Keyword cannot have escaped characters
        if (type !== Token.Identifier && (start + id.length !== this.index)) {
            const restore = this.index;
            this.index = start;
            this.tolerateUnexpectedToken(Messages.InvalidEscapedReservedWord);
            this.index = restore;
        }

        return {
            type,
            value: id,
            lineNumber: this.lineNumber,
            lineStart: this.lineStart,
            start,
            end: this.index
        };
    }

    private scanPunctuator(): RawToken {
        const start = this.index;

        // Check for most common single-character punctuators.
        let str = this.source[this.index];
        switch (str) {

            case '{':
                if (str === '{') {
                    this.curlyStack.push('{');
                }
                ++this.index;
                break;
            case '}':
                ++this.index;
                this.curlyStack.pop();
                break;
            case '(':
            case '.':
            case ')':
            case ';':
            case ',':
            case '[':
            case ']':
            case ':':
            case '?':
            case '~':
                ++this.index;
                break;

            default:
                // 4-character punctuator.
                // https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/Expressions_and_Operators
                str = this.source.substr(this.index, 4);
                if (str === '>>>=') { // Unsigned right shift assignment
                    this.index += 4;
                } else {

                    // 3-character punctuators.
                    str = str.substr(0, 3);
                    if (str === '>>>' ||
                        str === '<<=' || str === '>>=' || str === '**=') {
                        this.index += 3;
                    } else {

                        // 2-character punctuators.
                        str = str.substr(0, 2);
                        if (str === '&&' || str === '||' || str === '==' || str === '!=' ||
                            str === '+=' || str === '-=' || str === '*=' || str === '/=' ||
                            str === '++' || str === '--' || str === '<<' || str === '>>' ||
                            str === '&=' || str === '|=' || str === '^=' || str === '%=' ||
                            str === '<=' || str === '>=' || str === '=>' || str === '**') {
                            this.index += 2;
                        } else {

                            // 1-character punctuators.
                            str = this.source[this.index];
                            if ('<>=!+-*%&|^/'.indexOf(str) >= 0) {
                                ++this.index;
                            }
                        }
                    }
                }
        }

        if (this.index === start) {
            this.throwUnexpectedToken();
        }

        return {
            type: Token.Punctuator,
            value: str,
            lineNumber: this.lineNumber,
            lineStart: this.lineStart,
            start,
            end: this.index
        };
    }

    private scanNumericLiteral(): RawToken {
        const start = this.index;
        let ch = this.source[this.index];
        assert(Character.isDecimalDigit(ch.charCodeAt(0)) || (ch === '.'),
            'Numeric literal must start with a decimal digit or a decimal point');

        let literal = '';
        if (ch !== '.') {
            literal = ch;
            ch = this.source[++this.index];
            // Hex numbers start with '0x'.
            // Octal numbers start with '0o'.
            // Binary numbers start with '0b'.
            if (literal === '0') {
                if (ch === 'x' || ch === 'X') {
                    this.index++;
                    return this.scanHexLiteral(this.index);
                } else if (ch === 'o' || ch === 'O') {
                    this.index++;
                    return this.scanOctalLiteral(this.index);
                } else if (ch === 'b' || ch === 'B') {
                    this.index++;
                    return this.scanBinaryLiteral(this.index);
                }
            }

            while (Character.isDecimalDigit(this.source.charCodeAt(this.index))) {
                literal += this.source[this.index++];
            }
            ch = this.source[this.index];
        }

        if (ch === '.') {
            literal += ch;
            this.index++;
            while (Character.isDecimalDigit(this.source.charCodeAt(this.index))) {
                literal += this.source[this.index++];
            }
            ch = this.source[this.index];
        }

        if (ch === 'e' || ch === 'E') {
            literal += ch;

            ch = this.source[++this.index];
            if (ch === '+' || ch === '-') {
                literal += ch;
                this.index++;
            }
            if (Character.isDecimalDigit(this.source.charCodeAt(this.index))) {
                while (Character.isDecimalDigit(this.source.charCodeAt(this.index))) {
                    literal += this.source[this.index++];
                }
            } else {
                this.throwUnexpectedToken();
            }
        }

        if (!this.eof() && Character.isIdentifierStart(this.source.charCodeAt(this.index))) {
            this.throwUnexpectedToken();
        }

        return {
            type: Token.NumericLiteral,
            value: parseFloat(literal),
            lineNumber: this.lineNumber,
            lineStart: this.lineStart,
            start,
            end: this.index
        };
    }

    // It is assumed that start points to the first location AFTER the prefix
    private scanHexLiteral(start: number): RawToken {
        let literal = '';

        while (!this.eof()) {
            if (!Character.isHexDigit(this.source.charCodeAt(this.index))) {
                break;
            }
            literal += this.source[this.index++];
        }

        if (literal.length === 0) {
            // only 0x or 0X
            this.throwUnexpectedToken();
        }

        // TODO: I'm not sure why it is only these two
        // character classes that are invalid here
        if (!this.eof()) {
            if (Character.isIdentifierStart(this.source.charCodeAt(this.index))
                    || Character.isDecimalDigit(this.source.charCodeAt(this.index))) {
                this.throwUnexpectedToken();
            }
        }

        return {
            type: Token.NumericLiteral,
            value: parseInt(literal, 16),
            lineNumber: this.lineNumber,
            lineStart: this.lineStart,
            start,
            end: this.index
        } as RawToken;
    }

    // It is assumed that start points to the first location AFTER the prefix
    private scanBinaryLiteral(start: number): RawToken {
        let literal = '';

        while (!this.eof()) {
            if (!Character.isBinaryDigit(this.source.charCodeAt(this.index))) {
                break;
            }
            literal += this.source[this.index++];
        }

        if (literal.length === 0) {
            // only 0b or 0B
            this.throwUnexpectedToken();
        }

        // TODO: I'm not sure why it is only these two
        // character classes that are invalid here
        if (!this.eof()) {
            if (Character.isIdentifierStart(this.source.charCodeAt(this.index))
                    || Character.isDecimalDigit(this.source.charCodeAt(this.index))) {
                this.throwUnexpectedToken();
            }
        }

        return {
            type: Token.NumericLiteral,
            value: parseInt(literal, 2),
            lineNumber: this.lineNumber,
            lineStart: this.lineStart,
            start,
            end: this.index
        } as RawToken;
    }

    // It is assumed that start points to the first location AFTER the prefix
    private scanOctalLiteral(start: number): RawToken {
        let literal = '';

        while (!this.eof()) {
            if (!Character.isOctalDigit(this.source.charCodeAt(this.index))) {
                break;
            }
            literal += this.source[this.index++];
        }

        if (literal.length === 0) {
            // only 0o or 0O
            this.throwUnexpectedToken();
        }

        if (!this.eof()) {
            // TODO: I'm not sure why it is only these two
            // character classes that are invalid here
            if (Character.isIdentifierStart(this.source.charCodeAt(this.index))
                    || Character.isDecimalDigit(this.source.charCodeAt(this.index))) {
                this.throwUnexpectedToken();
            }
        }

        return {
            type: Token.NumericLiteral,
            value: parseInt(literal, 8),
            lineNumber: this.lineNumber,
            lineStart: this.lineStart,
            start,
            end: this.index
        } as RawToken;
    }

    private scanStringLiteral(): RawToken {
        const start = this.index;
        let quote = this.source[start];
        assert((quote === '\'' || quote === '"'),
            'String literals must start with a quote');

        let literal = '';
        while (!this.eof()) {
            let ch = this.source[this.index++];
            // If the current quote has been matched,
            // break the loop and end the string
            if (ch === quote) {
                quote = '';
                break;
            } else if (ch === '\\') { // Backslash is an escape character in strings
                ch = this.source[this.index++];
                if (!ch || !Character.isLineTerminator(ch.charCodeAt(0))) {
                    switch (ch) {
                        case 'u':
                            if (this.source[this.index] === '{') {
                                ++this.index;
                                literal += this.scanUnicodeCodePointEscape();
                            } else {
                                const unescaped = this.scanHexEscape(ch);
                                if (unescaped === null) {
                                    this.throwUnexpectedToken();
                                }
                                literal += unescaped;
                            }
                            break;
                        case 'x':
                            const unescaped = this.scanHexEscape(ch);
                            if (unescaped === null) {
                                this.throwUnexpectedToken(Messages.InvalidHexEscapeSequence);
                            }
                            literal += unescaped;
                            break;
                        case 'n':
                            literal += '\n';
                            break;
                        case 'r':
                            literal += '\r';
                            break;
                        case 't':
                            literal += '\t';
                            break;
                        case 'b':
                            literal += '\b';
                            break;
                        case 'f':
                            literal += '\f';
                            break;
                        case 'v':
                            literal += '\x0B';
                            break;
                        default:
                            literal += ch;
                    }
                } else {
                    this.lineNumber++;
                    // The previous char was a line terminator following an '\' escape character
                    // If it was a '\r' carriage return and the
                    // next char is a '\n' new line, advance the index
                    if (ch === '\r' && this.source[this.index] === '\n') {
                        this.index++;
                    }
                    this.lineStart = this.index;
                }
            }else if (Character.isLineTerminator(ch.charCodeAt(0))) {
                    // Unescaped line break, end the string
                    break;
            } else {
                literal += ch;
            }
        }

        // If the string was not closed, throw an error
        if (quote !== '') {
            // this.tolerateUnexpectedToken(Messages.UnexpectedToken);
            // break;
            this.index = start;
            this.throwUnexpectedToken();
        }

        return {
            type: Token.StringLiteral,
            value: literal,
            lineNumber: this.lineNumber,
            lineStart: this.lineStart,
            start,

            end: this.index
        } as RawToken;
    }

    private codePointAt(i: number): number {
        let cp = this.source.charCodeAt(i);

        if (cp >= 0xD800 && cp <= 0xDBFF) {
            const second = this.source.charCodeAt(i + 1);
            if (second >= 0xDC00 && second <= 0xDFFF) {
                const first = cp;
                cp = (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
            }
        }

        return cp;
    }

    private skipSingleLineComment(offset: number): Comment[] {
        const comments = [] as Comment[];
        let start;
        let loc;

        if (this.trackComment) {
            start = this.index - offset;
            loc = {
                start: {
                    line: this.lineNumber,
                    column: this.index - this.lineStart - offset
                } as Position,
                end: {} as Position
            };
        }

        while (!this.eof()) {
            const ch = this.source.charCodeAt(this.index);
            this.index++;
            if (Character.isLineTerminator(ch)) {
                if (this.trackComment) {
                    loc.end = {
                        line: this.lineNumber,
                        column: this.index = this.lineStart - 1
                    };
                    const entry: Comment = {
                        multiLine: false,
                        slice: [start + offset, this.index - 1],
                        range: [start, this.index - 1],
                        loc
                    };
                    comments.push(entry);
                }
                if (ch === 13 /* carriage return */ && this.source.charCodeAt(this.index) === 10 /* linefeed */) {
                    this.index++;
                }
                this.lineNumber++;
                this.lineStart = this.index;
                return comments;
            }
        }

        // Reached end of the file
        if (this.trackComment) {
            loc.end = {
                line: this.lineNumber,
                column: this.index - this.lineStart
            };
            const entry: Comment = {
                multiLine: false,
                slice: [start + offset, this.index],
                range: [start, this.index],
                loc
            };
            comments.push(entry);
        }

        return comments;
    }
}
