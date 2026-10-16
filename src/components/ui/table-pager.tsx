import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAGE_SIZES, Pager } from '@/lib/use-pagination';

const fmt = (n: number) => n.toLocaleString('en-IN');

// "enquiries" → "enquiry", "jobs / projects" → "job / project" (for a list of one)
const singular = (noun: string) =>
  noun
    .split(' ')
    .map((w) => (w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w))
    .join(' ');

// Page numbers to show: the first, the last and the ones next to the current page, with gaps as '…'
function pageNumbers(page: number, count: number): (number | '…')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const around = [page - 1, page, page + 1].filter((p) => p > 1 && p < count);
  if (page <= 3) around.push(2, 3, 4);
  if (page >= count - 2) around.push(count - 3, count - 2, count - 1);
  const pages = [...new Set([1, ...around, count])].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

const roundBtn =
  'w-8 h-8 shrink-0 rounded-full border border-slate-200 bg-white text-slate-600 inline-flex items-center justify-center hover:border-orange-300 hover:text-orange-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600 disabled:cursor-not-allowed transition-colors';

interface TablePagerProps<T> {
  pager: Pager<T>;
  noun: string; // what the rows are, plural ("enquiries")
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  className?: string;
}

// The bar above a list: "Showing 1 to 25 of 87", rows per page, search (press / to jump to it),
// "Page 1 of 4" and the page buttons. Phones get three rows; laptops one.
export function TablePager<T>({ pager, noun, search, className }: TablePagerProps<T>) {
  const { page, pageCount, pageSize, total, first, last, setPage, setPageSize } = pager;
  const searchRef = useRef<HTMLInputElement>(null);
  const hasSearch = !!search;
  const [pageText, setPageText] = useState(String(page));
  useEffect(() => setPageText(String(page)), [page]);

  // "/" jumps to the search box (unless the person is typing somewhere)
  useEffect(() => {
    if (!hasSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const input = searchRef.current;
      if (!input || input.offsetParent === null) return;
      e.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hasSearch]);

  const goTo = (text: string) => {
    const n = parseInt(text, 10);
    if (Number.isFinite(n)) setPage(n);
    else setPageText(String(page));
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 shadow-2xs',
        className
      )}
    >
      <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 w-full sm:w-auto">
        <span className="min-w-0 text-[13px] text-slate-600 sm:whitespace-nowrap">
          {total === 0 ? (
            <>No {noun}</>
          ) : (
            <>
              Showing <b className="font-mono text-slate-900">{fmt(first)}</b> to{' '}
              <b className="font-mono text-slate-900">{fmt(last)}</b> of{' '}
              <b className="font-mono text-slate-900">{fmt(total)}</b> {total === 1 ? singular(noun) : noun}
            </>
          )}
        </span>
        <label className="shrink-0 flex items-center gap-1.5 h-8 pl-3 pr-1 rounded-full border border-slate-200 bg-white text-[13px] text-slate-600 whitespace-nowrap">
          Rows:
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-6 rounded-full bg-orange-50 border border-orange-200 px-1.5 font-mono font-semibold text-orange-700 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {search && (
        <div className="relative w-full lg:w-auto lg:flex-1 lg:min-w-[280px] lg:max-w-md lg:mx-auto order-last lg:order-none">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="w-full h-9 rounded-full border border-slate-200 bg-white pl-9 pr-10 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
          <kbd className="hidden lg:flex absolute right-2.5 top-1/2 -translate-y-1/2 h-5 min-w-5 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1 text-[11px] font-mono text-slate-500">
            /
          </kbd>
        </div>
      )}

      <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto justify-between sm:justify-end">
        <label className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-slate-200 bg-white text-[13px] text-slate-600 whitespace-nowrap">
          Page
          <input
            type="text"
            inputMode="numeric"
            value={pageText}
            onChange={(e) => setPageText(e.target.value.replace(/\D/g, ''))}
            onBlur={(e) => goTo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && goTo((e.target as HTMLInputElement).value)}
            aria-label="Page number"
            className="w-9 h-6 rounded-full border border-slate-200 bg-slate-50 text-center font-mono font-semibold text-slate-900 focus:outline-none focus:border-orange-500"
          />
          of <span className="font-mono">{fmt(pageCount)}</span>
        </label>
        <div className="flex items-center gap-1">
          <button type="button" className={roundBtn} onClick={() => setPage(1)} disabled={page <= 1} aria-label="First page">
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button type="button" className={roundBtn} onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="hidden md:flex items-center gap-1">
            {pageNumbers(page, pageCount).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="w-5 text-center text-slate-400 text-[13px]">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === page ? 'page' : undefined}
                  className={cn(
                    roundBtn,
                    'min-w-8 w-auto px-2 font-mono text-[13px] font-semibold',
                    p === page && 'bg-orange-500 border-orange-500 text-white hover:text-white hover:border-orange-500'
                  )}
                >
                  {p}
                </button>
              )
            )}
          </div>
          <button type="button" className={roundBtn} onClick={() => setPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" className={roundBtn} onClick={() => setPage(pageCount)} disabled={page >= pageCount} aria-label="Last page">
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
