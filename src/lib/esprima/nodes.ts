import { Syntax } from './syntax';

export type ArgumentListElement = Expression;
export type BindingIdentifier = Identifier;
export type Declaration = FunctionDeclaration | VariableDeclaration;
export type Expression = AssignmentExpression | BinaryExpression | CallExpression
    | ConditionalExpression | Identifier | FunctionExpression | Literal | SequenceExpression
    | UnaryExpression | UpdateExpression;
export type FunctionParameter = BindingIdentifier;
export type Statement = BreakStatement | ContinueStatement | DebuggerStatement | DoWhileStatement
    | EmptyStatement | ExpressionStatement | ForStatement | FunctionDeclaration | IfStatement
    | ReturnStatement | ThrowStatement | VariableDeclaration | WhileStatement;
export type StatementListItem = Declaration | Statement;

/* tslint:disable:max-classes-per-file */

export class AssignmentExpression {
    public readonly type: string;
    public readonly operator: string;
    public readonly left: Expression;
    public readonly right: Expression;
    constructor(operator: string, left: Expression, right: Expression) {
        this.type = Syntax.AssignmentExpression;
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
}

export class BinaryExpression {
    public readonly type: string;
    public readonly operator: string;
    public readonly left: Expression;
    public readonly right: Expression;
    constructor(operator: string, left: Expression, right: Expression) {
        const logical = (operator === '||' || operator === '&&');
        this.type = logical ? Syntax.LogicalExpression : Syntax.BinaryExpression;
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
}

export class BlockStatement {
    public readonly type: string;
    public readonly body: Statement[];
    constructor(body: Statement[]) {
        this.type = Syntax.BlockStatement;
        this.body = body;
    }
}

export class BreakStatement {
    public readonly type: string;
    public readonly label: Identifier | null;
    constructor(label: Identifier | null) {
        this.type = Syntax.BreakStatement;
        this.label = label;
    }
}

export class CallExpression {
    public readonly type: string;
    public readonly callee: Expression;
    public readonly arguments: ArgumentListElement[];
    constructor(callee: Expression, args: ArgumentListElement[]) {
        this.type = Syntax.CallExpression;
        this.callee = callee;
        this.arguments = args;
    }
}

export class ConditionalExpression {
    public readonly type: string;
    public readonly test: Expression;
    public readonly consequent: Expression;
    public readonly alternate: Expression;
    constructor(test: Expression, consequent: Expression, alternate: Expression) {
        this.type = Syntax.ConditionalExpression;
        this.test = test;
        this.consequent = consequent;
        this.alternate = alternate;
    }
}

export class ContinueStatement {
    public readonly type: string;
    public readonly label: Identifier | null;
    constructor(label: Identifier | null) {
        this.type = Syntax.ContinueStatement;
        this.label = label;
    }
}

export class DebuggerStatement {
    public readonly type: string;
    constructor() {
        this.type = Syntax.DebuggerStatement;
    }
}

export class DoWhileStatement {
    public readonly type: string;
    public readonly body: Statement;
    public readonly test: Expression;
    constructor(body: Statement, test: Expression) {
        this.type = Syntax.DoWhileStatement;
        this.body = body;
        this.test = test;
    }
}

export class EmptyStatement {
    public readonly type: string;
    constructor() {
        this.type = Syntax.EmptyStatement;
    }
}

export class ExpressionStatement {
    public readonly type: string;
    public readonly expression: Expression;
    constructor(expression: Expression) {
        this.type = Syntax.ExpressionStatement;
        this.expression = expression;
    }
}

export class ForStatement {
    public readonly type: string;
    public readonly init: Expression | null;
    public readonly test: Expression | null;
    public readonly update: Expression | null;
    public body: Statement;
    constructor(init: Expression | null, test: Expression | null, update: Expression | null, body: Statement) {
        this.type = Syntax.ForStatement;
        this.init = init;
        this.test = test;
        this.update = update;
        this.body = body;
    }
}

export class FunctionDeclaration {
    public readonly type: string;
    public readonly id: Identifier | null;
    public readonly params: FunctionParameter[];
    public readonly body: BlockStatement;
    public readonly generator: boolean;
    public readonly expression: boolean;
    public readonly async: boolean;
    constructor(id: Identifier | null, params: FunctionParameter[], body: BlockStatement, generator: boolean) {
        this.type = Syntax.FunctionDeclaration;
        this.id = id;
        this.params = params;
        this.body = body;
        this.generator = generator;
        this.expression = false;
        this.async = false;
    }
}

export class FunctionExpression {
    public readonly type: string;
    public readonly id: Identifier | null;
    public readonly params: FunctionParameter[];
    public readonly body: BlockStatement;
    public readonly generator: boolean;
    public readonly expression: boolean;
    public readonly async: boolean;
    constructor(id: Identifier | null, params: FunctionParameter[], body: BlockStatement, generator: boolean) {
        this.type = Syntax.FunctionExpression;
        this.id = id;
        this.params = params;
        this.body = body;
        this.generator = generator;
        this.expression = false;
        this.async = false;
    }
}

export class Identifier {
    public readonly type: string;
    public readonly name: string;
    constructor(name: string) {
        this.type = Syntax.Identifier;
        this.name = name;
    }
}

export class IfStatement {
    public readonly type: string;
    public readonly test: Expression;
    public readonly consequent: Statement;
    public readonly alternate: Statement | null;
    constructor(test: Expression, consequent: Statement, alternate: Statement | null) {
        this.type = Syntax.IfStatement;
        this.test = test;
        this.consequent = consequent;
        this.alternate = alternate;
    }
}

export class LabeledStatement {
    public readonly type: string;
    public readonly label: Identifier;
    public readonly body: Statement;
    constructor(label: Identifier, body: Statement) {
        this.type = Syntax.LabeledStatement;
        this.label = label;
        this.body = body;
    }
}

export class Literal {
    public readonly type: string;
    public readonly value: boolean | number | string | null;
    public readonly raw: string;
    constructor(value: boolean | number | string | null, raw: string) {
        this.type = Syntax.Literal;
        this.value = value;
        this.raw = raw;
    }
}

export class MethodDefinition {
    public readonly type: string;
    public readonly key: Expression | null;
    public readonly computed: boolean;
    public readonly value: FunctionExpression | null;
    public readonly kind: string;
    public readonly static: boolean;
    constructor(key: Expression | null, computed: boolean, value: FunctionExpression | null,
                kind: string, isStatic: boolean) {
        this.type = Syntax.MethodDefinition;
        this.key = key;
        this.computed = computed;
        this.value = value;
        this.kind = kind;
        this.static = isStatic;
    }
}

export class ReturnStatement {
    public readonly type: string;
    public readonly argument: Expression | null;
    constructor(argument: Expression | null) {
        this.type = Syntax.ReturnStatement;
        this.argument = argument;
    }
}

export class Script {
    public readonly type: string;
    public readonly body: StatementListItem[];
    public readonly sourceType: string;
    constructor(body: StatementListItem[]) {
        this.type = Syntax.Program;
        this.body = body;
        this.sourceType = 'script';
    }
}

export class SequenceExpression {
    public readonly type: string;
    public readonly expressions: Expression[];
    constructor(expressions: Expression[]) {
        this.type = Syntax.SequenceExpression;
        this.expressions = expressions;
    }
}

export class ThrowStatement {
    public readonly type: string;
    public readonly argument: Expression;
    constructor(argument: Expression) {
        this.type = Syntax.ThrowStatement;
        this.argument = argument;
    }
}

export class UnaryExpression {
    public readonly type: string;
    public readonly operator: string;
    public readonly argument: Expression;
    public readonly prefix: boolean;
    constructor(operator: string, argument: Expression) {
        this.type = Syntax.UnaryExpression;
        this.operator = operator;
        this.argument = argument;
        this.prefix = true;
    }
}

export class UpdateExpression {
    public readonly type: string;
    public readonly operator: string;
    public readonly argument: Expression;
    public readonly prefix: boolean;
    constructor(operator: string, argument: Expression, prefix: boolean) {
        this.type = Syntax.UpdateExpression;
        this.operator = operator;
        this.argument = argument;
        this.prefix = prefix;
    }
}

export class VariableDeclaration {
    public readonly type: string;
    public readonly declarations: VariableDeclarator[];
    public readonly kind: string;
    constructor(declarations: VariableDeclarator[], kind: string) {
        this.type = Syntax.VariableDeclaration;
        this.declarations = declarations;
        this.kind = kind;
    }
}

export class VariableDeclarator {
    public readonly type: string;
    public readonly id: BindingIdentifier;
    public readonly init: Expression | null;
    constructor(id: BindingIdentifier, init: Expression | null) {
        this.type = Syntax.VariableDeclarator;
        this.id = id;
        this.init = init;
    }
}

export class WhileStatement {
    public readonly type: string;
    public readonly test: Expression;
    public readonly body: Statement;
    constructor(test: Expression, body: Statement) {
        this.type = Syntax.WhileStatement;
        this.test = test;
        this.body = body;
    }
}

export class AssignmentPattern {
    public readonly type: string;
    public readonly left: BindingIdentifier;
    public readonly right: Expression;
    constructor(left: BindingIdentifier, right: Expression) {
        this.type = Syntax.AssignmentPattern;
        this.left = left;
        this.right = right;
    }
}
