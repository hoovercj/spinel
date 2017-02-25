export namespace Operator {

    export function is(token: string): boolean {
        return OperatorKind.to(token) != null;
    }

    export enum OperatorKind {
        Addition,
        Subtraction,
        Multiplation,
        Division,
    }

    export namespace OperatorKind {

        export function from(kind: number | OperatorKind): string {
            switch (kind) {
                case OperatorKind.Addition:
                    return '+';
                case OperatorKind.Subtraction:
                    return '-';
                case OperatorKind.Multiplation:
                    return '*';
                case OperatorKind.Division:
                    return '/';
                default:
                    return '';
            }
        }

        export function to(type: string): OperatorKind {
            switch (type) {
                case '+':
                    return OperatorKind.Addition;
                case '-':
                    return OperatorKind.Subtraction;
                case '*':
                    return OperatorKind.Multiplation;
                case '/':
                    return OperatorKind.Division;
                default:
                    return null;
            }
        }
    }
}
