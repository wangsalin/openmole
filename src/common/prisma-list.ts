export function buildPagination(query: { page?: number; pageSize?: number }) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 20);
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function omitUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
