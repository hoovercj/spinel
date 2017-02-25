export declare namespace Operator {
    function is(token: string): boolean;
    enum OperatorKind {
        Addition = 0,
        Subtraction = 1,
        Multiplation = 2,
        Division = 3,
    }
    namespace OperatorKind {
        function from(kind: number | OperatorKind): string;
        function to(type: string): OperatorKind;
    }
}
