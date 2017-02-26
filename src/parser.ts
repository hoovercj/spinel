import { assert } from './lib/esprima/assert';
import { ErrorHandler } from './lib/esprima/error-handler';
import { Messages } from './lib/esprima/messages';
import * as Node from './lib/esprima/nodes';
import { Syntax } from './lib/esprima/syntax';
import { Token, TokenName } from './lib/esprima/token';
import { Comment, RawToken, Scanner, SourceLocation } from './scanner';

export interface Config {
    range: boolean;
    loc: boolean;
    source: string | null;
    tokens: boolean;
    comment: boolean;
    tolerant: boolean;
}

export interface Context {
    firstCoverInitializedNameError: RawToken | null;
    isAssignmentTarget: boolean;
    isBindingElement: boolean;
    inFunctionBody: boolean;
    inIteration: boolean;
    labelSet: any;
}

export interface Marker {
    index: number;
    line: number;
    column: number;
}

export interface DeclarationOptions {
    inFor: boolean;
}

export interface TokenEntry {
    type: string;
    value: string;
    regex?: {
        pattern: string;
        flags: string;
    };
    range?: [number, number];
    loc?: SourceLocation;
}

export class Parser {
    public readonly config: Config;
    private readonly delegate: any;
    public readonly errorHandler: ErrorHandler;
    private readonly scanner: Scanner;
    private readonly operatorPrecedence: any;

    private lookahead: RawToken;
    private hasLineTerminator: boolean;

    private context: Context;
    public tokens: any[];
    private startMarker: Marker;
    private lastMarker: Marker;

    constructor(code: string, options: any = {}, delegate: any) {
        this.config = {
            range: (typeof options.range === 'boolean') && options.range,
            loc: (typeof options.loc === 'boolean') && options.loc,
            source: null,
            tokens: (typeof options.tokens === 'boolean') && options.tokens,
            comment: (typeof options.comment === 'boolean') && options.comment,
            tolerant: (typeof options.tolerant === 'boolean') && options.tolerant
        };
        if (this.config.loc && options.source && options.source !== null) {
            this.config.source = String(options.source);
        }

        this.delegate = delegate;

        this.errorHandler = new ErrorHandler();
        this.errorHandler.tolerant = this.config.tolerant;
        this.scanner = new Scanner(code, this.errorHandler);
        this.scanner.trackComment = this.config.comment;

        this.operatorPrecedence = {
            ')': 0,
            ';': 0,
            ',': 0,
            '=': 0,
            ']': 0,
            '||': 1,
            '&&': 2,
            '|': 3,
            '^': 4,
            '&': 5,
            '==': 6,
            '!=': 6,
            '===': 6,
            '!==': 6,
            '<': 7,
            '>': 7,
            '<=': 7,
            '>=': 7,
            '<<': 8,
            '>>': 8,
            '>>>': 8,
            '+': 9,
            '-': 9,
            '*': 11,
            '/': 11,
            '%': 11
        };

        this.lookahead = {
            type: Token.EOF,
            value: '',
            lineNumber: this.scanner.lineNumber,
            lineStart: 0,
            start: 0,
            end: 0
        };
        this.hasLineTerminator = false;

        this.context = {
            firstCoverInitializedNameError: null,
            isAssignmentTarget: false,
            isBindingElement: false,
            inFunctionBody: false,
            inIteration: false,
            labelSet: {},
        };
        this.tokens = [];

        this.startMarker = {
            index: 0,
            line: this.scanner.lineNumber,
            column: 0
        };
        this.lastMarker = {
            index: 0,
            line: this.scanner.lineNumber,
            column: 0
        };
        this.nextToken();
        this.lastMarker = {
            index: this.scanner.index,
            line: this.scanner.lineNumber,
            column: this.scanner.index - this.scanner.lineStart
        };
    }

    public parseScript(): Node.Script {
        const node = this.createNode();
        const body = [] as Node.Statement[];
        while (this.lookahead.type !== Token.EOF) {
            body.push(this.parseStatementListItem());
        }
        return this.finalize(node, new Node.Script(body));
    }

    private throwError(messageFormat: string, ...values: any[]): void {
        const args = Array.prototype.slice.call(arguments, 1);
        const msg = messageFormat.replace(/%(\d)/g, (whole, idx) => {
            assert(idx < args.length, 'Message reference must be in range');
            return args[idx];
        });

        const index = this.lastMarker.index;
        const line = this.lastMarker.line;
        const column = this.lastMarker.column + 1;
        throw this.errorHandler.createError(index, line, column, msg);
    }

    private tolerateError(messageFormat: any, ...values: any[]) {
        const args = Array.prototype.slice.call(arguments, 1);
        const msg = messageFormat.replace(/%(\d)/g, (whole: any, idx: any) => {
            assert(idx < args.length, 'Message reference must be in range');
            return args[idx];
        }
        );

        const index = this.lastMarker.index;
        const line = this.scanner.lineNumber;
        const column = this.lastMarker.column + 1;
        this.errorHandler.tolerateError(index, line, column, msg);
    }

    // Throw an exception because of the token.
    private unexpectedTokenError(token?: any, message?: string): Error {
        let msg = message || Messages.UnexpectedToken;

        let value;
        if (token) {
            if (!message) {
                msg = (token.type === Token.EOF) ? Messages.UnexpectedEOS :
                    (token.type === Token.Identifier) ? Messages.UnexpectedIdentifier :
                        (token.type === Token.NumericLiteral) ? Messages.UnexpectedNumber :
                            (token.type === Token.StringLiteral) ? Messages.UnexpectedString :
                                Messages.UnexpectedToken;

                if (token.type === Token.Keyword) {
                    msg = Messages.UnexpectedReserved;
                }
            }

            value = token.value;
        } else {
            value = 'ILLEGAL';
        }

        msg = msg.replace('%0', value);

        if (token && typeof token.lineNumber === 'number') {
            const index = token.start;
            const line = token.lineNumber;
            const lastMarkerLineStart = this.lastMarker.index - this.lastMarker.column;
            const column = token.start - lastMarkerLineStart + 1;
            return this.errorHandler.createError(index, line, column, msg);
        } else {
            const index = this.lastMarker.index;
            const line = this.lastMarker.line;
            const column = this.lastMarker.column + 1;
            return this.errorHandler.createError(index, line, column, msg);
        }
    }

    private throwUnexpectedToken(token?: any, message?: string): never {
        throw this.unexpectedTokenError(token, message);
    }

    private tolerateUnexpectedToken(token?: any, message?: string) {
        this.errorHandler.tolerate(this.unexpectedTokenError(token, message));
    }

    private collectComments() {
        if (!this.config.comment) {
            this.scanner.scanComments();
        } else {
            const comments: Comment[] = this.scanner.scanComments();
            if (comments.length > 0 && this.delegate) {
                for (const comment of comments) {
                    const e: Comment = comment;
                    let node: any;
                    node = {
                        type: e.multiLine ? 'BlockComment' : 'LineComment',
                        value: this.scanner.source.slice(e.slice[0], e.slice[1])
                    };
                    if (this.config.range) {
                        node.range = e.range;
                    }
                    if (this.config.loc) {
                        node.loc = e.loc;
                    }
                    const metadata = {
                        start: {
                            line: e.loc.start.line,
                            column: e.loc.start.column,
                            offset: e.range[0]
                        },
                        end: {
                            line: e.loc.end.line,
                            column: e.loc.end.column,
                            offset: e.range[1]
                        }
                    };
                    this.delegate(node, metadata);
                }
            }
        }
    }

    // From internal representation to an external structure

    private getTokenRaw(token: RawToken): string {
        return this.scanner.source.slice(token.start, token.end);
    }

    private convertToken(token: RawToken): TokenEntry {
        const t: TokenEntry = {
            type: TokenName[token.type],
            value: this.getTokenRaw(token)
        };
        if (this.config.range) {
            t.range = [token.start, token.end];
        }
        if (this.config.loc) {
            t.loc = {
                start: {
                    line: this.startMarker.line,
                    column: this.startMarker.column
                },
                end: {
                    line: this.scanner.lineNumber,
                    column: this.scanner.index - this.scanner.lineStart
                }
            };
        }

        return t;
    }

    private nextToken(): RawToken {
        const token = this.lookahead;

        this.lastMarker.index = this.scanner.index;
        this.lastMarker.line = this.scanner.lineNumber;
        this.lastMarker.column = this.scanner.index - this.scanner.lineStart;

        this.collectComments();

        if (this.scanner.index !== this.startMarker.index) {
            this.startMarker.index = this.scanner.index;
            this.startMarker.line = this.scanner.lineNumber;
            this.startMarker.column = this.scanner.index - this.scanner.lineStart;
        }

        const next = this.scanner.lex();
        this.hasLineTerminator = (token.lineNumber !== next.lineNumber);

        this.lookahead = next;

        if (this.config.tokens && next.type !== Token.EOF) {
            this.tokens.push(this.convertToken(next));
        }

        return token;
    }

    private createNode(): Marker {
        return {
            index: this.startMarker.index,
            line: this.startMarker.line,
            column: this.startMarker.column
        };
    }

    private startNode(token: RawToken): Marker {
        return {
            index: token.start,
            line: token.lineNumber,
            column: token.start - token.lineStart
        };
    }

    private finalize(marker: Marker, node: any) {
        if (this.config.range) {
            node.range = [marker.index, this.lastMarker.index];
        }

        if (this.config.loc) {
            node.loc = {
                start: {
                    line: marker.line,
                    column: marker.column,
                },
                end: {
                    line: this.lastMarker.line,
                    column: this.lastMarker.column
                }
            };
            if (this.config.source) {
                node.loc.source = this.config.source;
            }
        }

        if (this.delegate) {
            const metadata = {
                start: {
                    line: marker.line,
                    column: marker.column,
                    offset: marker.index
                },
                end: {
                    line: this.lastMarker.line,
                    column: this.lastMarker.column,
                    offset: this.lastMarker.index
                }
            };
            this.delegate(node, metadata);
        }

        return node;
    }

    // Expect the next token to match the specified punctuator.
    // If not, an exception will be thrown.

    private expect(value: string | number) {
        const token = this.nextToken();
        if (token.type !== Token.Punctuator || token.value !== value) {
            this.throwUnexpectedToken(token);
        }
    }

    // Quietly expect a comma when in tolerant mode, otherwise delegates to expect().

    private expectCommaSeparator() {
        if (this.config.tolerant) {
            const token = this.lookahead;
            if (token.type === Token.Punctuator && token.value === ',') {
                this.nextToken();
            } else if (token.type === Token.Punctuator && token.value === ';') {
                this.nextToken();
                this.tolerateUnexpectedToken(token);
            } else {
                this.tolerateUnexpectedToken(token, Messages.UnexpectedToken);
            }
        } else {
            this.expect(',');
        }
    }

    // Expect the next token to match the specified keyword.
    // If not, an exception will be thrown.

    private expectKeyword(keyword: string) {
        const token = this.nextToken();
        if (token.type !== Token.Keyword || token.value !== keyword) {
            this.throwUnexpectedToken(token);
        }
    }

    // Return true if the next token matches the specified punctuator.

    private match(value: string) {
        return this.lookahead.type === Token.Punctuator && this.lookahead.value === value;
    }

    // Return true if the next token matches the specified keyword

    private matchKeyword(keyword: string) {
        return this.lookahead.type === Token.Keyword && this.lookahead.value === keyword;
    }

    // Return true if the next token matches the specified contextual keyword
    // (where an identifier is sometimes a keyword depending on the context)

    private matchContextualKeyword(keyword: string) {
        return this.lookahead.type === Token.Identifier && this.lookahead.value === keyword;
    }

    // Return true if the next token is an assignment operator

    private matchAssign() {
        if (this.lookahead.type !== Token.Punctuator) {
            return false;
        }
        const op = this.lookahead.value;
        return op === '=' ||
            op === '*=' ||
            op === '**=' ||
            op === '/=' ||
            op === '%=' ||
            op === '+=' ||
            op === '-=' ||
            op === '<<=' ||
            op === '>>=' ||
            op === '>>>=' ||
            op === '&=' ||
            op === '^=' ||
            op === '|=';
    }

    // Cover grammar support.
    //
    // When an assignment expression position starts with an left parenthesis, the determination of the type
    // of the syntax is to be deferred arbitrarily long until the end of the parentheses pair (plus a lookahead)
    // or the first comma. This situation also defers the determination of all the expressions nested in the pair.
    //
    // There are three productions that can be parsed in a parentheses pair that needs to be determined
    // after the outermost pair is closed. They are:
    //
    //   1. AssignmentExpression
    //   2. BindingElements
    //   3. AssignmentTargets
    //
    // In order to avoid exponential backtracking, we use two flags to denote if the production can be
    // binding element or assignment target.
    //
    // The three productions have the relationship:
    //
    //   BindingElements ⊆ AssignmentTargets ⊆ AssignmentExpression
    //
    // with a single exception that CoverInitializedName when used directly in an Expression, generates
    // an early error. Therefore, we need the third state, firstCoverInitializedNameError, to track the
    // first usage of CoverInitializedName and report it when we reached the end of the parentheses pair.
    //
    // isolateCoverGrammar function runs the given parser function with a new cover grammar context, and it does not
    // effect the current flags. This means the production the parser parses is only used as an expression. Therefore
    // the CoverInitializedName check is conducted.
    //
    // inheritCoverGrammar function runs the given parse function with a new cover grammar context, and it propagates
    // the flags outside of the parser. This means the production the parser parses is used as a part of a potential
    // pattern. The CoverInitializedName check is deferred.

    private isolateCoverGrammar(parseFunction: any) {
        const previousIsBindingElement = this.context.isBindingElement;
        const previousIsAssignmentTarget = this.context.isAssignmentTarget;
        const previousFirstCoverInitializedNameError = this.context.firstCoverInitializedNameError;

        this.context.isBindingElement = true;
        this.context.isAssignmentTarget = true;
        this.context.firstCoverInitializedNameError = null;

        const result = parseFunction.call(this);
        if (this.context.firstCoverInitializedNameError !== null) {
            this.throwUnexpectedToken(this.context.firstCoverInitializedNameError);
        }

        this.context.isBindingElement = previousIsBindingElement;
        this.context.isAssignmentTarget = previousIsAssignmentTarget;
        this.context.firstCoverInitializedNameError = previousFirstCoverInitializedNameError;

        return result;
    }

    private inheritCoverGrammar(parseFunction: any) {
        const previousIsBindingElement = this.context.isBindingElement;
        const previousIsAssignmentTarget = this.context.isAssignmentTarget;
        const previousFirstCoverInitializedNameError = this.context.firstCoverInitializedNameError;

        this.context.isBindingElement = true;
        this.context.isAssignmentTarget = true;
        this.context.firstCoverInitializedNameError = null;

        const result = parseFunction.call(this);

        this.context.isBindingElement = this.context.isBindingElement && previousIsBindingElement;
        this.context.isAssignmentTarget = this.context.isAssignmentTarget && previousIsAssignmentTarget;
        this.context.firstCoverInitializedNameError = previousFirstCoverInitializedNameError
            || this.context.firstCoverInitializedNameError;

        return result;
    }

    private consumeSemicolon() {
        if (this.match(';')) {
            this.nextToken();
        } else if (!this.hasLineTerminator) {
            if (this.lookahead.type !== Token.EOF && !this.match('}')) {
                this.throwUnexpectedToken(this.lookahead);
            }
            this.lastMarker.index = this.startMarker.index;
            this.lastMarker.line = this.startMarker.line;
            this.lastMarker.column = this.startMarker.column;
        }
    }

    // https://tc39.github.io/ecma262/#sec-primary-expression

    private parsePrimaryExpression(): Node.Expression {
        const node = this.createNode();

        let expr: Node.Expression;
        let token;
        let raw;

        switch (this.lookahead.type) {
            case Token.Identifier:
                expr = this.finalize(node, new Node.Identifier(this.nextToken().value as string));
                break;

            case Token.NumericLiteral:
            case Token.StringLiteral:
                this.context.isAssignmentTarget = false;
                this.context.isBindingElement = false;
                token = this.nextToken();
                raw = this.getTokenRaw(token);
                expr = this.finalize(node, new Node.Literal(token.value, raw));
                break;

            case Token.BooleanLiteral:
                this.context.isAssignmentTarget = false;
                this.context.isBindingElement = false;
                token = this.nextToken();
                raw = this.getTokenRaw(token);
                expr = this.finalize(node, new Node.Literal(token.value === 'true', raw));
                break;

            case Token.NullLiteral:
                this.context.isAssignmentTarget = false;
                this.context.isBindingElement = false;
                token = this.nextToken();
                raw = this.getTokenRaw(token);
                expr = this.finalize(node, new Node.Literal(null, raw));
                break;

            case Token.Punctuator:
                switch (this.lookahead.value) {
                    case '(':
                        this.context.isBindingElement = false;
                        // TODO: what is this?
                        expr = this.inheritCoverGrammar(this.parseGroupExpression);
                        break;
                    default:
                        expr = this.throwUnexpectedToken(this.nextToken());
                }
                break;

            case Token.Keyword:
                // TODO: do we use let?
                if (this.matchKeyword('let')) {
                    expr = this.finalize(node, new Node.Identifier(this.nextToken().value as string));
                } else {
                    this.context.isAssignmentTarget = false;
                    this.context.isBindingElement = false;
                    if (this.matchKeyword('def')) {
                        expr = this.parseFunctionExpression();
                    } else {
                        expr = this.throwUnexpectedToken(this.nextToken());
                    }
                }
                break;

            default:
                expr = this.throwUnexpectedToken(this.nextToken());
        }

        return expr;
    }

    private parseGroupExpression(): Node.Expression {
        let expr;

        this.expect('(');
        if (this.match(')')) {
            this.unexpectedTokenError(Messages.UnexpectedToken);
        } else {
            const startToken = this.lookahead;
            const params = [] as any[];

            // let arrow = false;
            this.context.isBindingElement = true;
            expr = this.inheritCoverGrammar(this.parseAssignmentExpression);

            if (this.match(',')) {
                const expressions: Node.Expression[] = [];

                this.context.isAssignmentTarget = false;
                expressions.push(expr);
                while (this.lookahead.type !== Token.EOF) {
                    if (!this.match(',')) {
                        break;
                    }
                    this.nextToken();
                    expressions.push(this.inheritCoverGrammar(this.parseAssignmentExpression));
                }
                expr = this.finalize(this.startNode(startToken), new Node.SequenceExpression(expressions));
            }

            this.expect(')');

            this.context.isBindingElement = false;
        }

        return expr;
    }

    // https://tc39.github.io/ecma262/#sec-left-hand-side-expressions

    private parseArguments(): Node.ArgumentListElement[] {
        this.expect('(');
        const args: Node.ArgumentListElement[] = [];
        if (!this.match(')')) {
            while (true) {
                const expr = this.isolateCoverGrammar(this.parseAssignmentExpression);
                args.push(expr);
                if (this.match(')')) {
                    break;
                }
                this.expectCommaSeparator();
                if (this.match(')')) {
                    break;
                }
            }
        }
        this.expect(')');

        return args;
    }

    private isIdentifierName(token: RawToken): boolean {
        return token.type === Token.Identifier ||
            token.type === Token.Keyword ||
            token.type === Token.BooleanLiteral ||
            token.type === Token.NullLiteral;
    }

    private parseIdentifierName(): Node.Identifier {
        const node = this.createNode();
        const token = this.nextToken();
        if (!this.isIdentifierName(token)) {
            this.throwUnexpectedToken(token);
        }
        return this.finalize(node, new Node.Identifier(token.value as string));
    }

    private parseLeftHandSideExpressionAllowCall(): Node.Expression {
        const startToken = this.lookahead;
        const maybeAsync = this.matchContextualKeyword('async');

        let expr = this.inheritCoverGrammar(this.parsePrimaryExpression);

        while (true) {
            if (this.match('(')) {
                this.context.isBindingElement = false;
                this.context.isAssignmentTarget = false;
                const args = this.parseArguments();
                expr = this.finalize(this.startNode(startToken), new Node.CallExpression(expr, args));
            } else {
                break;
            }
        }

        return expr;
    }

    private parseLeftHandSideExpression(): Node.Expression {
        const node = this.startNode(this.lookahead);
        return this.inheritCoverGrammar(this.parsePrimaryExpression);
    }

    // https://tc39.github.io/ecma262/#sec-update-expressions

    private parseUpdateExpression(): Node.Expression {
        let expr;
        const startToken = this.lookahead;

        if (this.match('++') || this.match('--')) {
            const node = this.startNode(startToken);
            const token = this.nextToken();
            expr = this.inheritCoverGrammar(this.parseUnaryExpression);
            if (!this.context.isAssignmentTarget) {
                this.tolerateError(Messages.InvalidLHSInAssignment);
            }
            const prefix = true;
            expr = this.finalize(node, new Node.UpdateExpression(token.value as string, expr, prefix));
            this.context.isAssignmentTarget = false;
            this.context.isBindingElement = false;
        } else {
            expr = this.inheritCoverGrammar(this.parseLeftHandSideExpressionAllowCall);
            if (!this.hasLineTerminator && this.lookahead.type === Token.Punctuator) {
                if (this.match('++') || this.match('--')) {
                    if (!this.context.isAssignmentTarget) {
                        this.tolerateError(Messages.InvalidLHSInAssignment);
                    }
                    this.context.isAssignmentTarget = false;
                    this.context.isBindingElement = false;
                    const operator = this.nextToken().value;
                    const prefix = false;
                    expr = this.finalize(this.startNode(startToken),
                        new Node.UpdateExpression(operator as string, expr, prefix));
                }
            }
        }

        return expr;
    }

    private parseUnaryExpression(): Node.Expression {
        let expr;

        if (this.match('+') || this.match('-') || this.match('~') || this.match('!') ||
            this.matchKeyword('delete') || this.matchKeyword('void') || this.matchKeyword('typeof')) {
            const node = this.startNode(this.lookahead);
            const token = this.nextToken();
            expr = this.inheritCoverGrammar(this.parseUnaryExpression);
            expr = this.finalize(node, new Node.UnaryExpression(token.value as string, expr));
            this.context.isAssignmentTarget = false;
            this.context.isBindingElement = false;
        } else {
            expr = this.parseUpdateExpression();
        }

        return expr;
    }

    private parseExponentiationExpression(): Node.Expression {
        const startToken = this.lookahead;

        let expr = this.inheritCoverGrammar(this.parseUnaryExpression);
        if (expr.type !== Syntax.UnaryExpression && this.match('**')) {
            this.nextToken();
            this.context.isAssignmentTarget = false;
            this.context.isBindingElement = false;
            const left = expr;
            const right = this.isolateCoverGrammar(this.parseExponentiationExpression);
            expr = this.finalize(this.startNode(startToken), new Node.BinaryExpression('**', left, right));
        }

        return expr;
    }

    // https://tc39.github.io/ecma262/#sec-exp-operator
    // https://tc39.github.io/ecma262/#sec-multiplicative-operators
    // https://tc39.github.io/ecma262/#sec-additive-operators
    // https://tc39.github.io/ecma262/#sec-bitwise-shift-operators
    // https://tc39.github.io/ecma262/#sec-relational-operators
    // https://tc39.github.io/ecma262/#sec-equality-operators
    // https://tc39.github.io/ecma262/#sec-binary-bitwise-operators
    // https://tc39.github.io/ecma262/#sec-binary-logical-operators

    private binaryPrecedence(token: RawToken): number {
        const op = token.value;
        let precedence;
        if (token.type === Token.Punctuator) {
            precedence = this.operatorPrecedence[op] || 0;
        } else if (token.type === Token.Keyword) {
            precedence = 0;
        } else {
            precedence = 0;
        }
        return precedence;
    }

    private parseBinaryExpression(): Node.Expression {
        const startToken = this.lookahead;

        let expr = this.inheritCoverGrammar(this.parseExponentiationExpression);

        const token = this.lookahead;
        let prec = this.binaryPrecedence(token);
        if (prec > 0) {
            this.nextToken();

            this.context.isAssignmentTarget = false;
            this.context.isBindingElement = false;

            const markers = [startToken, this.lookahead];
            let left = expr;
            let right = this.isolateCoverGrammar(this.parseExponentiationExpression);

            const stack = [left, token.value, right];
            const precedences: number[] = [prec];
            while (true) {
                prec = this.binaryPrecedence(this.lookahead);
                if (prec <= 0) {
                    break;
                }

                // Reduce: make a binary expression from the three topmost entries.
                while ((stack.length > 2) && (prec <= precedences[precedences.length - 1])) {
                    right = stack.pop();
                    const operator = stack.pop();
                    precedences.pop();
                    left = stack.pop();
                    markers.pop();
                    const node = this.startNode(markers[markers.length - 1]);
                    stack.push(this.finalize(node, new Node.BinaryExpression(operator, left, right)));
                }

                // Shift.
                stack.push(this.nextToken().value);
                precedences.push(prec);
                markers.push(this.lookahead);
                stack.push(this.isolateCoverGrammar(this.parseExponentiationExpression));
            }

            // Final reduce to clean-up the stack.
            let i = stack.length - 1;
            expr = stack[i];
            markers.pop();
            while (i > 1) {
                const node = this.startNode(markers.pop());
                const operator = stack[i - 1];
                expr = this.finalize(node, new Node.BinaryExpression(operator, stack[i - 2], expr));
                i -= 2;
            }
        }

        return expr;
    }

    // https://tc39.github.io/ecma262/#sec-conditional-operator

    private parseConditionalExpression(): Node.Expression {
        const startToken = this.lookahead;

        let expr = this.inheritCoverGrammar(this.parseBinaryExpression);
        if (this.match('?')) {
            this.nextToken();

            const consequent = this.isolateCoverGrammar(this.parseAssignmentExpression);

            this.expect(':');
            const alternate = this.isolateCoverGrammar(this.parseAssignmentExpression);

            expr = this.finalize(this.startNode(startToken),
                new Node.ConditionalExpression(expr, consequent, alternate));
            this.context.isAssignmentTarget = false;
            this.context.isBindingElement = false;
        }

        return expr;
    }

    // https://tc39.github.io/ecma262/#sec-assignment-operators

    private parseAssignmentExpression(): Node.Expression {
        let expr;

        const startToken = this.lookahead;
        let token = startToken;
        expr = this.parseConditionalExpression();

        if (this.matchAssign()) {
            if (!this.context.isAssignmentTarget) {
                this.tolerateError(Messages.InvalidLHSInAssignment);
            }

            if (!this.match('=')) {
                this.context.isAssignmentTarget = false;
                this.context.isBindingElement = false;
            } else {
                // TODO: did I mess up?
                // this.reinterpretExpressionAsPattern(expr);
            }

            token = this.nextToken();
            const operator = token.value as string;
            const right = this.isolateCoverGrammar(this.parseAssignmentExpression);
            expr = this.finalize(this.startNode(startToken), new Node.AssignmentExpression(operator, expr, right));
            this.context.firstCoverInitializedNameError = null;
        }

        return expr;
    }

    // https://tc39.github.io/ecma262/#sec-comma-operator

    private parsePattern(params: any, kind?: string): Node.BindingIdentifier {
        let pattern;

        if (this.matchKeyword('let') && (kind === 'const' || kind === 'let')) {
            this.tolerateUnexpectedToken(this.lookahead, Messages.LetInLexicalBinding);
        }
        params.push(this.lookahead);
        pattern = this.parseVariableIdentifier(kind);

        return pattern;
    }

    private parseExpression(): Node.Expression | Node.SequenceExpression {
        const startToken = this.lookahead;
        let expr = this.isolateCoverGrammar(this.parseAssignmentExpression);

        if (this.match(',')) {
            const expressions: Node.Expression[] = [];
            expressions.push(expr);
            while (this.lookahead.type !== Token.EOF) {
                if (!this.match(',')) {
                    break;
                }
                this.nextToken();
                expressions.push(this.isolateCoverGrammar(this.parseAssignmentExpression));
            }

            expr = this.finalize(this.startNode(startToken), new Node.SequenceExpression(expressions));
        }

        return expr;
    }

    // https://tc39.github.io/ecma262/#sec-block

    private parseStatementListItem(): Node.StatementListItem {
        let statement: Node.StatementListItem;
        this.context.isAssignmentTarget = true;
        this.context.isBindingElement = true;
        if (this.lookahead.type === Token.Keyword) {
            switch (this.lookahead.value) {
                case 'const':
                    statement = this.parseLexicalDeclaration({ inFor: false });
                    break;
                case 'def':
                    statement = this.parseFunctionDeclaration();
                    break;
                case 'let':
                    statement = this.isLexicalDeclaration() ?
                        this.parseLexicalDeclaration({ inFor: false }) : this.parseStatement();
                    break;
                default:
                    statement = this.parseStatement();
                    break;
            }
        } else {
            statement = this.parseStatement();
        }

        return statement;
    }

    private parseBlock(): Node.BlockStatement {
        const node = this.createNode();

        this.expect('{');
        const block: Node.StatementListItem[] = [];
        while (true) {
            if (this.match('}')) {
                break;
            }
            block.push(this.parseStatementListItem());
        }
        this.expect('}');

        return this.finalize(node, new Node.BlockStatement(block));
    }

    // https://tc39.github.io/ecma262/#sec-let-and-const-declarations

    private parseLexicalBinding(kind: string, options: any): Node.VariableDeclarator {
        const node = this.createNode();
        const params = [] as any[];
        const id = this.parsePattern(params, kind);

        let init: Node.Expression | null = null;
        if (kind === 'const') {
            if (this.match('=')) {
                this.nextToken();
                init = this.isolateCoverGrammar(this.parseAssignmentExpression);
            } else {
                this.throwError(Messages.DeclarationMissingInitializer, 'const');
            }
        } else if ((!options.inFor && id.type !== Syntax.Identifier) || this.match('=')) {
            this.expect('=');
            init = this.isolateCoverGrammar(this.parseAssignmentExpression);
        }

        return this.finalize(node, new Node.VariableDeclarator(id, init));
    }

    private parseBindingList(kind: string, options: any): Node.VariableDeclarator[] {
        const list = [this.parseLexicalBinding(kind, options)];

        while (this.match(',')) {
            this.nextToken();
            list.push(this.parseLexicalBinding(kind, options));
        }

        return list;
    }

    private isLexicalDeclaration(): boolean {
        const state = this.scanner.saveState();
        this.scanner.scanComments();
        const next = this.scanner.lex();
        this.scanner.restoreState(state);

        return (next.type === Token.Identifier) ||
            (next.type === Token.Punctuator && next.value === '[') ||
            (next.type === Token.Punctuator && next.value === '{') ||
            (next.type === Token.Keyword && next.value === 'let') ||
            (next.type === Token.Keyword && next.value === 'yield');
    }

    private parseLexicalDeclaration(options: any): Node.VariableDeclaration {
        const node = this.createNode();
        const kind = this.nextToken().value as string;
        assert(kind === 'let' || kind === 'const', 'Lexical declaration must be either let or const');

        const declarations = this.parseBindingList(kind, options);
        this.consumeSemicolon();

        return this.finalize(node, new Node.VariableDeclaration(declarations, kind));
    }

    // https://tc39.github.io/ecma262/#sec-destructuring-binding-patterns

    private parseVariableIdentifier(kind?: string): Node.Identifier {
        const node = this.createNode();

        const token = this.nextToken();
        if (token.type !== Token.Identifier) {
            if (token.value !== 'let' || kind !== 'var') {
                this.throwUnexpectedToken(token);
            }
        }

        return this.finalize(node, new Node.Identifier(token.value as string));
    }

    private parseVariableDeclaration(options: DeclarationOptions): Node.VariableDeclarator {
        const node = this.createNode();

        const params = [] as any[];
        const id = this.parsePattern(params, 'var');

        let init = null;
        if (this.match('=')) {
            this.nextToken();
            init = this.isolateCoverGrammar(this.parseAssignmentExpression);
        } else if (id.type !== Syntax.Identifier && !options.inFor) {
            this.expect('=');
        }

        return this.finalize(node, new Node.VariableDeclarator(id, init));
    }

    private parseVariableDeclarationList(options: any): Node.VariableDeclarator[] {
        const opt: DeclarationOptions = { inFor: options.inFor };

        const list: Node.VariableDeclarator[] = [];
        list.push(this.parseVariableDeclaration(opt));
        while (this.match(',')) {
            this.nextToken();
            list.push(this.parseVariableDeclaration(opt));
        }

        return list;
    }

    private parseVariableStatement(): Node.VariableDeclaration {
        const node = this.createNode();
        this.expectKeyword('var');
        const declarations = this.parseVariableDeclarationList({ inFor: false });
        this.consumeSemicolon();

        return this.finalize(node, new Node.VariableDeclaration(declarations, 'var'));
    }

    // https://tc39.github.io/ecma262/#sec-empty-statement

    private parseEmptyStatement(): Node.EmptyStatement {
        const node = this.createNode();
        this.expect(';');
        return this.finalize(node, new Node.EmptyStatement());
    }

    // https://tc39.github.io/ecma262/#sec-expression-statement

    private parseExpressionStatement(): Node.ExpressionStatement {
        const node = this.createNode();
        const expr = this.parseExpression();
        this.consumeSemicolon();
        return this.finalize(node, new Node.ExpressionStatement(expr));
    }

    // https://tc39.github.io/ecma262/#sec-if-statement

    private parseIfClause(): Node.Statement {
        return this.parseStatement();
    }

    private parseIfStatement(): Node.IfStatement {
        const node = this.createNode();
        let consequent: Node.Statement;
        let alternate: Node.Statement | null = null;

        this.expectKeyword('if');
        this.expect('(');
        const test = this.parseExpression();

        if (!this.match(')') && this.config.tolerant) {
            this.tolerateUnexpectedToken(this.nextToken());
            consequent = this.finalize(this.createNode(), new Node.EmptyStatement());
        } else {
            this.expect(')');
            consequent = this.parseIfClause();
            if (this.matchKeyword('else')) {
                this.nextToken();
                alternate = this.parseIfClause();
            }
        }

        return this.finalize(node, new Node.IfStatement(test, consequent, alternate));
    }

    // https://tc39.github.io/ecma262/#sec-do-while-statement

    private parseDoWhileStatement(): Node.DoWhileStatement {
        const node = this.createNode();
        this.expectKeyword('do');

        const previousInIteration = this.context.inIteration;
        this.context.inIteration = true;
        const body = this.parseStatement();
        this.context.inIteration = previousInIteration;

        this.expectKeyword('while');
        this.expect('(');
        const test = this.parseExpression();

        if (!this.match(')') && this.config.tolerant) {
            this.tolerateUnexpectedToken(this.nextToken());
        } else {
            this.expect(')');
            if (this.match(';')) {
                this.nextToken();
            }
        }

        return this.finalize(node, new Node.DoWhileStatement(body, test));
    }

    // https://tc39.github.io/ecma262/#sec-while-statement

    private parseWhileStatement(): Node.WhileStatement {
        const node = this.createNode();
        let body;

        this.expectKeyword('while');
        this.expect('(');
        const test = this.parseExpression();

        if (!this.match(')') && this.config.tolerant) {
            this.tolerateUnexpectedToken(this.nextToken());
            body = this.finalize(this.createNode(), new Node.EmptyStatement());
        } else {
            this.expect(')');

            const previousInIteration = this.context.inIteration;
            this.context.inIteration = true;
            body = this.parseStatement();
            this.context.inIteration = previousInIteration;
        }

        return this.finalize(node, new Node.WhileStatement(test, body));
    }

    // https://tc39.github.io/ecma262/#sec-for-statement
    // https://tc39.github.io/ecma262/#sec-for-in-and-for-of-statements

    private parseForStatement(): Node.ForStatement {
        let init: any = null;
        let test: Node.Expression | null = null;
        let update: Node.Expression | null = null;
        const forIn = true;
        let left;
        let right;

        const node = this.createNode();
        this.expectKeyword('for');
        this.expect('(');

        if (this.match(';')) {
            this.nextToken();
        } else {
            if (this.matchKeyword('var')) {
                init = this.createNode();
                this.nextToken();

                const declarations = this.parseVariableDeclarationList({ inFor: true });

                if (declarations.length === 1 && this.matchKeyword('in')) {
                    const decl = declarations[0];
                    init = this.finalize(init, new Node.VariableDeclaration(declarations, 'var'));
                    this.nextToken();
                    left = init;
                    right = this.parseExpression();
                    init = null;
                } else {
                    init = this.finalize(init, new Node.VariableDeclaration(declarations, 'var'));
                    this.expect(';');
                }
            } else if (this.matchKeyword('const') || this.matchKeyword('let')) {
                init = this.createNode();
                const kind = this.nextToken().value as string;

                const declarations = this.parseBindingList(kind, { inFor: true });
                this.consumeSemicolon();
                init = this.finalize(init, new Node.VariableDeclaration(declarations, kind));
            } else {
                const initStartToken = this.lookahead;
                init = this.inheritCoverGrammar(this.parseAssignmentExpression);

                if (this.match(',')) {
                    const initSeq = [init];
                    while (this.match(',')) {
                        this.nextToken();
                        initSeq.push(this.isolateCoverGrammar(this.parseAssignmentExpression));
                    }
                    init = this.finalize(this.startNode(initStartToken), new Node.SequenceExpression(initSeq));
                }
                this.expect(';');
            }
        }

        if (typeof left === 'undefined') {
            if (!this.match(';')) {
                test = this.parseExpression();
            }
            this.expect(';');
            if (!this.match(')')) {
                update = this.parseExpression();
            }
        }

        let body;
        if (!this.match(')') && this.config.tolerant) {
            this.tolerateUnexpectedToken(this.nextToken());
            body = this.finalize(this.createNode(), new Node.EmptyStatement());
        } else {
            this.expect(')');

            const previousInIteration = this.context.inIteration;
            this.context.inIteration = true;
            body = this.isolateCoverGrammar(this.parseStatement);
            this.context.inIteration = previousInIteration;
        }

        return (typeof left === 'undefined') ?
            this.finalize(node, new Node.ForStatement(init, test, update, body)) :
            this.throwError(Messages.InvalidLHSInForLoop);
    }

    // https://tc39.github.io/ecma262/#sec-continue-statement

    private parseContinueStatement(): Node.ContinueStatement {
        const node = this.createNode();
        this.expectKeyword('continue');

        let label: Node.Identifier | null = null;
        if (this.lookahead.type === Token.Identifier && !this.hasLineTerminator) {
            const id = this.parseVariableIdentifier();
            label = id;

            const key = '$' + id.name;
            if (!Object.prototype.hasOwnProperty.call(this.context.labelSet, key)) {
                this.throwError(Messages.UnknownLabel, id.name);
            }
        }

        this.consumeSemicolon();
        if (label === null && !this.context.inIteration) {
            this.throwError(Messages.IllegalContinue);
        }

        return this.finalize(node, new Node.ContinueStatement(label));
    }

    // https://tc39.github.io/ecma262/#sec-break-statement

    private parseBreakStatement(): Node.BreakStatement {
        const node = this.createNode();
        this.expectKeyword('break');

        let label: Node.Identifier | null = null;
        if (this.lookahead.type === Token.Identifier && !this.hasLineTerminator) {
            const id = this.parseVariableIdentifier();

            const key = '$' + id.name;
            if (!Object.prototype.hasOwnProperty.call(this.context.labelSet, key)) {
                this.throwError(Messages.UnknownLabel, id.name);
            }
            label = id;
        }

        this.consumeSemicolon();
        if (label === null && !this.context.inIteration) {
            this.throwError(Messages.IllegalBreak);
        }

        return this.finalize(node, new Node.BreakStatement(label));
    }

    // https://tc39.github.io/ecma262/#sec-return-statement

    private parseReturnStatement(): Node.ReturnStatement {
        if (!this.context.inFunctionBody) {
            this.tolerateError(Messages.IllegalReturn);
        }

        const node = this.createNode();
        this.expectKeyword('return');

        const hasArgument = !this.match(';') && !this.match('}') &&
            !this.hasLineTerminator && this.lookahead.type !== Token.EOF;
        const argument = hasArgument ? this.parseExpression() : null;
        this.consumeSemicolon();

        return this.finalize(node, new Node.ReturnStatement(argument));
    }

    // https://tc39.github.io/ecma262/#sec-with-statement

    private parseLabelledStatement(): Node.LabeledStatement | Node.ExpressionStatement {
        const node = this.createNode();
        const expr = this.parseExpression();

        let statement: Node.ExpressionStatement | Node.LabeledStatement;
        if ((expr.type === Syntax.Identifier) && this.match(':')) {
            this.nextToken();

            const id = expr as Node.Identifier;
            const key = '$' + id.name;
            if (Object.prototype.hasOwnProperty.call(this.context.labelSet, key)) {
                this.throwError(Messages.Redeclaration, 'Label', id.name);
            }

            this.context.labelSet[key] = true;
            let body: Node.Statement;
            if (this.matchKeyword('def')) {
                const token = this.lookahead;
                const declaration = this.parseFunctionDeclaration();
                body = declaration;
            } else {
                body = this.parseStatement();
            }
            delete this.context.labelSet[key];

            statement = new Node.LabeledStatement(id, body);
        } else {
            this.consumeSemicolon();
            statement = new Node.ExpressionStatement(expr);
        }

        return this.finalize(node, statement);
    }

    // https://tc39.github.io/ecma262/#sec-throw-statement

    private parseThrowStatement(): Node.ThrowStatement {
        const node = this.createNode();
        this.expectKeyword('throw');

        if (this.hasLineTerminator) {
            this.throwError(Messages.NewlineAfterThrow);
        }

        const argument = this.parseExpression();
        this.consumeSemicolon();

        return this.finalize(node, new Node.ThrowStatement(argument));
    }

    // https://tc39.github.io/ecma262/#sec-debugger-statement

    private parseDebuggerStatement(): Node.DebuggerStatement {
        const node = this.createNode();
        this.expectKeyword('debugger');
        this.consumeSemicolon();
        return this.finalize(node, new Node.DebuggerStatement());
    }

    // https://tc39.github.io/ecma262/#sec-ecmascript-language-statements-and-declarations

    private parseStatement(): Node.Statement {
        let statement: Node.Statement;
        switch (this.lookahead.type) {
            case Token.BooleanLiteral:
            case Token.NullLiteral:
            case Token.NumericLiteral:
            case Token.StringLiteral:
            case Token.Punctuator:
                const value = this.lookahead.value;
                if (value === '{') {
                    statement = this.parseBlock();
                } else if (value === '(') {
                    statement = this.parseExpressionStatement();
                } else if (value === ';') {
                    statement = this.parseEmptyStatement();
                } else {
                    statement = this.parseExpressionStatement();
                }
                break;

            case Token.Identifier:
                statement = this.parseLabelledStatement();
                break;

            case Token.Keyword:
                switch (this.lookahead.value) {
                    case 'break':
                        statement = this.parseBreakStatement();
                        break;
                    case 'continue':
                        statement = this.parseContinueStatement();
                        break;
                    case 'debugger':
                        statement = this.parseDebuggerStatement();
                        break;
                    case 'do':
                        statement = this.parseDoWhileStatement();
                        break;
                    case 'for':
                        statement = this.parseForStatement();
                        break;
                    case 'def':
                        statement = this.parseFunctionDeclaration();
                        break;
                    case 'if':
                        statement = this.parseIfStatement();
                        break;
                    case 'return':
                        statement = this.parseReturnStatement();
                        break;
                    case 'throw':
                        statement = this.parseThrowStatement();
                        break;
                    case 'var':
                        statement = this.parseVariableStatement();
                        break;
                    case 'while':
                        statement = this.parseWhileStatement();
                        break;
                    default:
                        statement = this.parseExpressionStatement();
                        break;
                }
                break;

            default:
                statement = this.throwUnexpectedToken(this.lookahead);
        }

        return statement;
    }

    // https://tc39.github.io/ecma262/#sec-function-definitions

    private parseFunctionSourceElements(): Node.BlockStatement {
        const node = this.createNode();

        this.expect('{');
        const body = [] as Node.Statement[];

        const previousLabelSet = this.context.labelSet;
        const previousInIteration = this.context.inIteration;
        const previousInFunctionBody = this.context.inFunctionBody;

        this.context.labelSet = {};
        this.context.inIteration = false;
        this.context.inFunctionBody = true;

        while (this.lookahead.type !== Token.EOF) {
            if (this.match('}')) {
                break;
            }
            body.push(this.parseStatementListItem());
        }

        this.expect('}');

        this.context.labelSet = previousLabelSet;
        this.context.inIteration = previousInIteration;
        this.context.inFunctionBody = previousInFunctionBody;

        return this.finalize(node, new Node.BlockStatement(body));
    }

    private validateParam(options: any, param: any, name: string) {
        const key = '$' + name;

        /* istanbul ignore next */
        if (typeof Object.defineProperty === 'function') {
            Object.defineProperty(options.paramSet, key,
                { value: true, enumerable: true, writable: true, configurable: true });
        } else {
            options.paramSet[key] = true;
        }
    }

    private parsePatternWithDefault(params: any, kind?: string): Node.AssignmentPattern | Node.BindingIdentifier {
        const startToken = this.lookahead;

        let pattern = this.parsePattern(params, kind);
        if (this.match('=')) {
            this.nextToken();
            const right = this.isolateCoverGrammar(this.parseAssignmentExpression);
            pattern = this.finalize(this.startNode(startToken), new Node.AssignmentPattern(pattern, right));
        }

        return pattern;
    }

    private parseFormalParameter(options: any) {
        const params: any[] = [];
        const param = this.parsePatternWithDefault(params);
        for (const p of params) {
            this.validateParam(options, p, p.value);
        }
        options.simple = options.simple && (param instanceof Node.Identifier);
        options.params.push(param);
    }

    private parseFormalParameters(firstRestricted?: any) {
        let options;

        options = {
            simple: true,
            params: [],
            firstRestricted
        } as any;

        this.expect('(');
        if (!this.match(')')) {
            options.paramSet = {};
            while (this.lookahead.type !== Token.EOF) {
                this.parseFormalParameter(options);
                if (this.match(')')) {
                    break;
                }
                this.expect(',');
                if (this.match(')')) {
                    break;
                }
            }
        }
        this.expect(')');

        return {
            simple: options.simple,
            params: options.params,
            stricted: options.stricted,
            firstRestricted: options.firstRestricted,
            message: options.message
        };
    }

    private parseFunctionDeclaration(identifierIsOptional?: boolean): Node.FunctionDeclaration {
        const node = this.createNode();

        const isAsync = this.matchContextualKeyword('async');
        if (isAsync) {
            this.nextToken();
        }

        this.expectKeyword('def');

        const isGenerator = isAsync ? false : this.match('*');
        if (isGenerator) {
            this.nextToken();
        }

        let message;
        let id: Node.Identifier | null = null;
        let firstRestricted: RawToken | null = null;

        if (!identifierIsOptional || !this.match('(')) {
            const token = this.lookahead;
            id = this.parseVariableIdentifier();
        }

        const formalParameters = this.parseFormalParameters(firstRestricted);
        const params = formalParameters.params;
        const stricted = formalParameters.stricted;
        firstRestricted = formalParameters.firstRestricted;
        if (formalParameters.message) {
            message = formalParameters.message;
        }

        const body = this.parseFunctionSourceElements();

        return this.finalize(node, new Node.FunctionDeclaration(id, params, body, isGenerator));
    }

    private parseFunctionExpression(): Node.FunctionExpression {
        const node = this.createNode();

        const isAsync = this.matchContextualKeyword('async');
        if (isAsync) {
            this.nextToken();
        }

        this.expectKeyword('def');

        const isGenerator = isAsync ? false : this.match('*');
        if (isGenerator) {
            this.nextToken();
        }

        let message;
        let id: Node.Identifier | null = null;
        let firstRestricted;

        if (!this.match('(')) {
            const token = this.lookahead;
            id = this.parseVariableIdentifier();
        }

        const formalParameters = this.parseFormalParameters(firstRestricted);
        const params = formalParameters.params;
        const stricted = formalParameters.stricted;
        firstRestricted = formalParameters.firstRestricted;
        if (formalParameters.message) {
            message = formalParameters.message;
        }

        const body = this.parseFunctionSourceElements();
        return this.finalize(node, new Node.FunctionExpression(id, params, body, isGenerator));
    }

    // https://tc39.github.io/ecma262/#sec-method-definitions

    private isStartOfExpression(): boolean {
        let start = true;

        const value = this.lookahead.value;
        switch (this.lookahead.type) {
            case Token.Punctuator:
                start = (value === '[') || (value === '(') || (value === '{') ||
                    (value === '+') || (value === '-') ||
                    (value === '!') || (value === '~') ||
                    (value === '++') || (value === '--') ||
                    (value === '/') || (value === '/=');  // regular expression literal
                break;

            case Token.Keyword:
                start = (value === 'def') || (value === 'let');
                break;

            default:
                break;
        }

        return start;
    }
}
