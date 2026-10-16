import { useEffect, useState } from 'react';

export const PAGE_SIZES = [10, 25, 50, 100];

export interface Pager<T> {
  items: T[]; // the rows on this page
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  first: number; // 1-based number of the first row shown (0 when there are none)
  last: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

// Splits a list into pages. Goes back to page 1 when `resetKeys` change (search, tab, filters, dates);
// a page beyond the end (rows removed) shows the last page instead.
export function usePagination<T>(rows: T[], resetKeys: unknown[] = [], initialSize = 25): Pager<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const resetKey = JSON.stringify(resetKeys);
  useEffect(() => setPage(1), [resetKey]);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    page: current,
    pageCount,
    pageSize,
    total,
    first: total === 0 ? 0 : start + 1,
    last: Math.min(start + pageSize, total),
    setPage: (p) => setPage(Math.min(Math.max(1, Math.round(p) || 1), pageCount)),
    setPageSize: (size) => {
      setPageSize(size);
      setPage(1);
    },
  };
}
