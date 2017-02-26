export declare class Error {
    name: string;
    message: string;
    index: number;
    lineNumber: number;
    column: number;
    description: string;
    constructor(message: string);
}
export declare class ErrorHandler {
    readonly errors: Error[];
    tolerant: boolean;
    constructor();
    recordError(error: Error): void;
    tolerate(error: Error): void;
    constructError(msg: string, column: number): Error;
    createError(index: number, line: number, col: number, description: string): Error;
    throwError(index: number, line: number, col: number, description: string): never;
    tolerateError(index: number, line: number, col: number, description: string): void;
}
