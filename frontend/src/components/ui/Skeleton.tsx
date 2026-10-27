import type { CSSProperties } from 'react';
import { cn } from '../../utils/cn';

interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  circle?: boolean;
  className?: string;
}

/** A placeholder block shown while content loads. */
export function Skeleton({ width, height = 14, circle = false, className }: SkeletonProps) {
  return <span className={cn('skeleton', circle && 'skeleton--circle', className)} style={{ width, height }} aria-hidden="true" />;
}

/** Placeholder rows for a table body. Widths vary a little so it reads like text. */
export function SkeletonRows({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} className="table__skeleton-row" aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              <Skeleton width={`${45 + ((row * 17 + column * 29) % 45)}%`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
