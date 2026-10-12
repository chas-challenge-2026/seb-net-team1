import { useState } from "react";
import type { Account } from "../../types/Account";

const colors = ["#008a52", "#4aa879", "#93c9aa"];
const numberFormat = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const monthFormat = new Intl.DateTimeFormat("sv-SE", { month: "short", timeZone: "UTC" });

type AccountBalanceChartProps = { accounts: Account[] };

export default function AccountBalanceChart({ accounts }: AccountBalanceChartProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const visibleAccounts = selectedAccountId === null
    ? accounts
    : accounts.filter((account) => account.id === selectedAccountId);
  const months = accounts[0]?.balanceHistory ?? [];
  const values = visibleAccounts.flatMap((account) => account.balanceHistory.map((point) => Number(point.balance)));
  const maxBalance = Math.max(1, ...values.filter(Number.isFinite));
  const chart = { left: 74, top: 22, width: 626, height: 174 };
  const groupWidth = chart.width / Math.max(months.length, 1);
  const barWidth = Math.min(22, groupWidth / (visibleAccounts.length + 1));

  const formatMonth = (month: string) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    return monthFormat.format(date).replace(".", "");
  };

  return (
    <section className="balance-history" aria-labelledby="balance-history-heading">
      <div className="balance-history__header">
        <div>
          <h2 id="balance-history-heading">Saldoutveckling</h2>
          <p>Utgående saldo per månad · senaste sex månaderna</p>
        </div>
        {selectedAccountId !== null && (
          <button className="balance-history__reset" type="button" onClick={() => setSelectedAccountId(null)}>
            Visa alla konton
          </button>
        )}
      </div>

      {months.length === 0 ? (
        <p className="balance-history__empty">Saldohistorik saknas.</p>
      ) : (
        <div className="balance-history__chart-scroll">
          <svg className="balance-history__chart" viewBox="0 0 740 240" role="img" aria-label="Stapeldiagram över saldot per konto och månad">
            {[0, 0.5, 1].map((fraction) => {
              const y = chart.top + chart.height * (1 - fraction);
              return (
                <g key={fraction}>
                  <line x1={chart.left} x2={chart.left + chart.width} y1={y} y2={y} className="balance-history__gridline" />
                  <text x={chart.left - 10} y={y + 4} textAnchor="end" className="balance-history__axis-label">
                    {numberFormat.format(maxBalance * fraction)}
                  </text>
                </g>
              );
            })}
            {months.map((month, monthIndex) => {
              const groupStart = chart.left + monthIndex * groupWidth;
              const barsWidth = visibleAccounts.length * barWidth;
              const firstX = groupStart + (groupWidth - barsWidth) / 2;
              return (
                <g key={month.month}>
                  {visibleAccounts.map((account, accountIndex) => {
                    const point = account.balanceHistory.find((item) => item.month === month.month);
                    const value = Number(point?.balance ?? 0);
                    const height = Math.max(1, (value / maxBalance) * chart.height);
                    const x = firstX + accountIndex * barWidth;
                    const y = chart.top + chart.height - height;
                    const accountOriginalIndex = accounts.findIndex((item) => item.id === account.id);
                    return (
                      <rect key={account.id} x={x} y={y} width={barWidth - 3} height={height} rx="3" fill={colors[accountOriginalIndex % colors.length]}>
                        <title>{`${account.accountName}: ${numberFormat.format(value)} ${account.currency}`}</title>
                      </rect>
                    );
                  })}
                  <text x={groupStart + groupWidth / 2} y={chart.top + chart.height + 22} textAnchor="middle" className="balance-history__axis-label">
                    {formatMonth(month.month)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <div className="balance-history__legend" aria-label="Filtrera diagrammet per konto">
        {accounts.map((account, index) => (
          <button
            key={account.id}
            type="button"
            className={`balance-history__legend-item${selectedAccountId === account.id ? " is-selected" : ""}`}
            aria-pressed={selectedAccountId === account.id}
            onClick={() => setSelectedAccountId(selectedAccountId === account.id ? null : account.id)}
          >
            <span style={{ backgroundColor: colors[index % colors.length] }} aria-hidden="true" />
            {account.accountName}
          </button>
        ))}
      </div>
    </section>
  );
}
