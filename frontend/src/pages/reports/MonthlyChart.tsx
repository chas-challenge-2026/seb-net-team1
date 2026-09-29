import { useId, useState } from 'react';
import type { MonthlyReport } from '../../api/types';
import { cn } from '../../utils/cn';
import { formatMonthLong, formatMonthShort } from '../../utils/date';
import { formatNumber } from '../../utils/format';
import { formatCompactMoney, formatMoney, moneyToCents } from '../../utils/money';

/** A "nice" tick step (1, 2, 2.5 or 5 × 10ⁿ) so the axis reads 0 / 25 tkr / 50 tkr… */
function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

function axisTicks(max: number): number[] {
  if (max <= 0) return [0];
  const step = niceStep(max / 4);
  const ticks: number[] = [];
  for (let value = 0; value < max + step; value += step) ticks.push(value);
  return ticks;
}

interface MonthlyChartProps {
  months: MonthlyReport[];
  /** Dims the chart while another period loads. */
  refetching?: boolean;
}

/**
 * Completed amount per month as a column chart. Hover or focus a column for all
 * values of that month. Built with plain HTML/CSS; the table view is the accessible twin.
 */
export function MonthlyChart({ months, refetching = false }: MonthlyChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const tooltipId = useId();

  const values = months.map((month) => moneyToCents(month.completedAmount) / 100);
  const max = Math.max(0, ...values);
  const ticks = axisTicks(max);
  const top = ticks[ticks.length - 1] || 1;

  return (
    <div className={cn('chart', months.length > 6 && 'chart--dense', refetching && 'is-refetching')}>
      <div className="chart__plot">
        <div className="chart__y-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="chart__y-tick" style={{ bottom: `${(tick / top) * 100}%` }}>
              {formatCompactMoney(tick)}
            </span>
          ))}
        </div>
        <div className="chart__area">
          <div className="chart__grid" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} className="chart__gridline" style={{ bottom: `${(tick / top) * 100}%` }} />
            ))}
          </div>
          <ol className="chart__columns" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
            {months.map((month, index) => {
              const value = values[index];
              const isActive = active === index;
              const label = `${formatMonthLong(month.month)}: ${formatMoney(month.completedAmount)} genomfört i ${formatNumber(
                month.completedCount,
              )} betalningar`;
              const edge = index === 0 ? 'start' : index === months.length - 1 ? 'end' : null;
              return (
                <li key={month.month} className={cn('chart__column', isActive && 'is-active')}>
                  <button
                    type="button"
                    className="chart__hit"
                    aria-label={label}
                    aria-describedby={isActive ? tooltipId : undefined}
                    onPointerEnter={() => setActive(index)}
                    onPointerLeave={() => setActive((current) => (current === index ? null : current))}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive((current) => (current === index ? null : current))}
                  >
                    <span
                      className={cn('chart__bar', value === 0 && 'chart__bar--empty')}
                      style={{ height: `${(value / top) * 100}%` }}
                    />
                  </button>
                  {isActive && (
                    <div
                      className={cn('chart__tooltip', edge && `chart__tooltip--${edge}`)}
                      role="tooltip"
                      id={tooltipId}
                      style={{ bottom: `calc(${(value / top) * 100}% + 10px)` }}
                    >
                      <p className="chart__tooltip-title">{formatMonthLong(month.month)}</p>
                      <dl className="chart__tooltip-rows">
                        <div>
                          <dt>
                            <span className="chart__key chart__key--completed" aria-hidden="true" />
                            Genomfört ({formatNumber(month.completedCount)})
                          </dt>
                          <dd>{formatMoney(month.completedAmount)}</dd>
                        </div>
                        <div>
                          <dt>
                            <span className="chart__key chart__key--pending" aria-hidden="true" />
                            Väntar ({formatNumber(month.pendingCount)})
                          </dt>
                          <dd>{formatMoney(month.pendingAmount)}</dd>
                        </div>
                        <div>
                          <dt>
                            <span className="chart__key chart__key--rejected" aria-hidden="true" />
                            Avvisat ({formatNumber(month.rejectedCount)})
                          </dt>
                          <dd>{formatMoney(month.rejectedAmount)}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <ol
        className="chart__x-axis"
        aria-hidden="true"
        style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
      >
        {months.map((month, index) => (
          <li key={month.month} className={cn('chart__x-label', active === index && 'is-active')}>
            <span>{formatMonthShort(month.month)}</span>
            {(index === 0 || month.month.endsWith('-01')) && (
              <span className="chart__x-year">{month.month.slice(0, 4)}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
