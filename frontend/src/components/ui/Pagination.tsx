import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { cn } from '../../utils/cn';
import { formatNumber } from '../../utils/format';

interface PaginationProps {
  /** 1-based. */
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

type PageEntry = number | 'gap';

function pageList(current: number, total: number): PageEntry[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((page) => pages.add(page));
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const entries: PageEntry[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) entries.push('gap');
    entries.push(page);
  });
  return entries;
}

export function Pagination({ page, pageSize, totalCount, onPageChange, className }: PaginationProps) {
  if (totalCount <= 0) return null;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = Math.min(totalCount, (page - 1) * pageSize + 1);
  const to = Math.min(totalCount, page * pageSize);

  return (
    <nav className={cn('pagination', className)} aria-label="Sidnumrering">
      <p className="pagination__summary">
        Visar <strong>{formatNumber(from)}–{formatNumber(to)}</strong> av <strong>{formatNumber(totalCount)}</strong>
      </p>
      {pageCount > 1 && (
        <div className="pagination__controls">
          <button
            type="button"
            className="pagination__button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Föregående sida"
          >
            <LuChevronLeft aria-hidden="true" />
          </button>
          {pageList(page, pageCount).map((entry, index) =>
            entry === 'gap' ? (
              <span key={`gap-${index}`} className="pagination__gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                className={cn('pagination__button', 'pagination__page', entry === page && 'is-current')}
                onClick={() => onPageChange(entry)}
                aria-current={entry === page ? 'page' : undefined}
                aria-label={`Sida ${entry}`}
              >
                {entry}
              </button>
            ),
          )}
          <button
            type="button"
            className="pagination__button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Nästa sida"
          >
            <LuChevronRight aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}
