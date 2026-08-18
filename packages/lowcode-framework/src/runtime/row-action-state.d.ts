export type LowCodeRowActionCondition = {
    field: string;
    operator?: 'eq' | 'neq' | 'in' | 'notIn' | 'gt' | 'gte' | 'lt' | 'lte' | 'truthy' | 'falsy';
    value?: unknown;
};
export type LowCodeRowActionPredicate = boolean | string | LowCodeRowActionCondition | LowCodeRowActionCondition[];
export type LowCodeRowActionState = {
    visible?: LowCodeRowActionPredicate;
    when?: LowCodeRowActionPredicate;
    disabled?: LowCodeRowActionPredicate;
};
export declare function matchesLowCodeRowActionPredicate(predicate: LowCodeRowActionPredicate | undefined, row: Record<string, unknown>, fallback: boolean): boolean;
export declare function visibleLowCodeRowActions<TAction extends LowCodeRowActionState>(actions: TAction[], row: Record<string, unknown>): TAction[];
export declare function isLowCodeRowActionDisabled(action: LowCodeRowActionState, row: Record<string, unknown>): boolean;
