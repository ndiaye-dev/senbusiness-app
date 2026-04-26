export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export function filterBySearch<T>(items: T[], query: string, resolver: (item: T) => string): T[] {
  if (!query.trim()) {
    return items;
  }

  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => resolver(item).toLowerCase().includes(normalizedQuery));
}

export function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total
  };
}
