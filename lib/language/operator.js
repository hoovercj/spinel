"use strict";
exports.__esModule = true;
var Operator;
(function (Operator) {
    function is(token) {
        return OperatorKind.to(token) != null;
    }
    Operator.is = is;
    var OperatorKind;
    (function (OperatorKind) {
        OperatorKind[OperatorKind["Addition"] = 0] = "Addition";
        OperatorKind[OperatorKind["Subtraction"] = 1] = "Subtraction";
        OperatorKind[OperatorKind["Multiplation"] = 2] = "Multiplation";
        OperatorKind[OperatorKind["Division"] = 3] = "Division";
    })(OperatorKind = Operator.OperatorKind || (Operator.OperatorKind = {}));
    (function (OperatorKind) {
        function from(kind) {
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
        OperatorKind.from = from;
        function to(type) {
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
        OperatorKind.to = to;
    })(OperatorKind = Operator.OperatorKind || (Operator.OperatorKind = {}));
})(Operator = exports.Operator || (exports.Operator = {}));
