type ExpressionScope = {
  data: Record<string, unknown>;
  forms: Record<string, Record<string, unknown>>;
  searches?: Record<string, Record<string, unknown>>;
  grids?: Record<string, unknown>;
  form?: Record<string, unknown>;
  route?: {
    query?: Record<string, unknown>;
    params?: Record<string, unknown>;
    path?: string;
    fullPath?: string;
  };
  event?: Record<string, unknown>;
  row?: Record<string, unknown>;
  values?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(source: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, source);
}

export function resolveExpression(expression: string, scope: ExpressionScope) {
  return readPath(
    {
      data: scope.data,
      forms: scope.forms,
      form: scope.form ?? {},
      search: scope.searches ?? {},
      grids: scope.grids ?? {},
      route: scope.route ?? { query: {}, params: {}, path: '', fullPath: '' },
      event: scope.event ?? {},
      row: scope.row ?? {},
      values: scope.values ?? {},
    },
    expression.trim()
  );
}

export function resolveRuntimeValue(value: unknown, scope: ExpressionScope): unknown {
  if (typeof value === 'string') {
    const exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (exact) return resolveExpression(exact[1], scope) ?? '';

    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression: string) =>
      String(resolveExpression(expression, scope) ?? '')
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveRuntimeValue(item, scope));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveRuntimeValue(item, scope)])
    );
  }

  return value;
}
