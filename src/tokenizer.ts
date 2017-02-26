import { ErrorHandler } from './lib/esprima/error-handler';
import { Token, TokenName } from './lib/esprima/token';
import { Comment, RawToken, Scanner, SourceLocation } from './scanner';

export interface BufferEntry {
    type: string;
    value: string;
    regex?: {
        pattern: string;
        flags: string;
    };
    range?: [number, number];
    loc?: SourceLocation;
}

/* tslint:disable:max-classes-per-file */

export interface Config {
    tolerant?: boolean;
    comment?: boolean;
    range?: boolean;
    loc?: boolean;
}

export class Tokenizer {
    private readonly errorHandler: ErrorHandler;
    private scanner: Scanner;
    private readonly trackRange: boolean;
    private readonly trackLoc: boolean;
    private readonly buffer: BufferEntry[];

    constructor(code: string, config: Config) {
        this.errorHandler = new ErrorHandler();
        this.errorHandler.tolerant = config ? (typeof config.tolerant === 'boolean' && config.tolerant) : false;

        this.scanner = new Scanner(code, this.errorHandler);
        this.scanner.trackComment = config ? (typeof config.comment === 'boolean' && config.comment) : false;

        this.trackRange = config ? (typeof config.range === 'boolean' && config.range) : false;
        this.trackLoc = config ? (typeof config.loc === 'boolean' && config.loc) : false;
        this.buffer = [];
    }

    private errors(): Error[] {
        return this.errorHandler.errors;
    }

    private getNextToken(): BufferEntry {
        // Normally one token at a time is added to the buffer.
        // However, comments can result in multiple buffer entries
        if (this.buffer.length === 0) {

            const comments: Comment[] = this.scanner.scanComments();
            if (this.scanner.trackComment) {
                for (const e of comments) {
                    const value = this.scanner.source.slice(e.slice[0], e.slice[1]);
                    const comment: BufferEntry = {
                        type: e.multiLine ? 'BlockComment' : 'LineComment',
                        value
                    };
                    if (this.trackRange) {
                        comment.range = e.range;
                    }
                    if (this.trackLoc) {
                        comment.loc = e.loc;
                    }
                    this.buffer.push(comment);
                }
            }

            if (!this.scanner.eof()) {
                let loc;

                if (this.trackLoc) {
                    loc = {
                        start: {
                            line: this.scanner.lineNumber,
                            column: this.scanner.index - this.scanner.lineStart
                        },
                        end: {}
                    } as SourceLocation;
                }

                let token: RawToken;
                token = this.scanner.lex();

                // TODO: check if this is necessary
                // This was being used to do regex checks
                // I've got rid of regex so i don't think this is necessary.
                // I think the / character will be handled properly but normal lex function
                // if (this.scanner.source[this.scanner.index] === '/') {
                //     this.scanner.scanPunctuator();
                // } else {
                //     token = this.scanner.lex();
                // }

                const entry: BufferEntry = {
                    type: TokenName[token.type],
                    value: this.scanner.source.slice(token.start, token.end)
                };
                if (this.trackRange) {
                    entry.range = [token.start, token.end];
                }
                if (this.trackLoc) {
                    loc.end = {
                        line: this.scanner.lineNumber,
                        column: this.scanner.index - this.scanner.lineStart
                    };
                    entry.loc = loc;
                }

                this.buffer.push(entry);
            }
        }

        return this.buffer.shift();
    }
}
