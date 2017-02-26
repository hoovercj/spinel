import * as repl from 'repl';
import { Config, Context, DeclarationOptions, Marker, Parser, TokenEntry } from './parser';

function parse(code: string, options: any, delegate: any) {
    // let commentHandler: CommentHandler | null = null;
    const proxyDelegate = (node: any, metadata: any) => {
        if (delegate) {
            delegate(node, metadata);
        }
        // if (commentHandler) {
        //     commentHandler.visit(node, metadata);
        // }
    };

    const parserDelegate = (typeof delegate === 'function') ? proxyDelegate : null;
    let collectComment = false;
    if (options) {
        collectComment = (typeof options.comment === 'boolean' && options.comment);
        const attachComment = (typeof options.attachComment === 'boolean' && options.attachComment);
        // if (collectComment || attachComment) {
        //     commentHandler = new CommentHandler();
        //     commentHandler.attach = attachComment;
        //     options.comment = true;
        //     parserDelegate = proxyDelegate;
        // }
    }

    const parser = new Parser(code, options, parserDelegate);

    const program = parser.parseScript();
    const ast = program as any;

    // if (collectComment && commentHandler) {
    //     ast.comments = commentHandler.comments;
    // }
    if (parser.config.tokens) {
        ast.tokens = parser.tokens;
    }
    if (parser.config.tolerant) {
        ast.errors = parser.errorHandler.errors;
    }

    return ast;
}

function evaluate(input: any, context: any, filename: any, callback: any) {
    const output = parse(input, {}, null);
    callback(null, JSON.stringify(output));
}

repl.start({prompt: '> ', eval: evaluate});
