import { Link } from '@tanstack/react-router';
import { LuArrowRight, LuBanknote, LuClock, LuLandmark, LuPlus, LuWallet } from 'react-icons/lu';
import { useAccounts } from '../../api/accounts';
import type { Account } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge } from '../../components/ui/Badge';
import { buttonClass } from '../../components/ui/buttonClass';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { IbanText } from '../../components/ui/IbanText';
import { Money } from '../../components/ui/Money';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatCard } from '../../components/ui/StatCard';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatNumber } from '../../utils/format';
import { sumMoney } from '../../utils/money';
import '../../styles/pages/accounts.css';

export function AccountsPage() {
  useDocumentTitle('Konton');
  const accounts = useAccounts();
  const { canCreatePayments } = useAuth();

  const list = accounts.data ?? [];
  const currency = list[0]?.currency ?? 'SEK';
  const loading = accounts.isPending;

  return (
    <div className="page">
      <PageHeader
        title="Konton"
        description="Företagets konton med saldo, tillgängligt belopp och det som är reserverat för väntande betalningar."
        actions={
          canCreatePayments && (
            <Link to="/payments/new" className={buttonClass()}>
              <LuPlus aria-hidden="true" />
              Ny betalning
            </Link>
          )
        }
      />

      {accounts.isError ? (
        <Card>
          <ErrorState
            error={accounts.error}
            title="Kontona kunde inte hämtas"
            onRetry={() => void accounts.refetch()}
            retrying={accounts.isFetching}
          />
        </Card>
      ) : (
        <>
          <section className="stat-grid" aria-label="Summering av alla konton">
            <StatCard
              label="Totalt saldo"
              icon={LuWallet}
              loading={loading}
              value={<Money amount={sumMoney(list.map((account) => account.balance))} currency={currency} />}
            />
            <StatCard
              label="Tillgängligt"
              icon={LuBanknote}
              tone="info"
              loading={loading}
              value={<Money amount={sumMoney(list.map((account) => account.availableBalance))} currency={currency} />}
              meta="Saldo minus reserverade belopp"
            />
            <StatCard
              label="Reserverat"
              icon={LuClock}
              tone="warning"
              loading={loading}
              value={<Money amount={sumMoney(list.map((account) => account.reservedAmount))} currency={currency} />}
              meta="För betalningar som väntar på attest"
            />
            <StatCard
              label="Antal konton"
              icon={LuLandmark}
              tone="neutral"
              loading={loading}
              value={formatNumber(list.length)}
            />
          </section>

          {loading ? (
            <div className="account-grid" aria-busy="true">
              {[0, 1, 2].map((key) => (
                <Card key={key} className="account-card" aria-hidden="true">
                  <Skeleton width="45%" height={16} />
                  <Skeleton width="75%" />
                  <Skeleton width="60%" height={28} />
                  <Skeleton width="85%" />
                </Card>
              ))}
            </div>
          ) : list.length === 0 ? (
            <Card>
              <EmptyState icon={LuLandmark} title="Inga konton" description="Företaget har inga konton ännu." />
            </Card>
          ) : (
            <div className="account-grid">
              {list.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AccountCard({ account }: { account: Account }) {
  return (
    <article className="card account-card account-card--interactive">
      <div className="account-card__head">
        <span className="account-card__icon">
          <LuLandmark aria-hidden="true" />
        </span>
        <div className="account-card__title-wrap">
          <h2 className="account-card__title">
            <Link to="/accounts/$accountId" params={{ accountId: account.id }} className="account-card__link">
              {account.accountName}
            </Link>
          </h2>
          <IbanText iban={account.iban} copyable className="account-card__iban" />
        </div>
      </div>

      <div className="account-card__balance">
        <span className="account-card__label">Saldo</span>
        <Money amount={account.balance} currency={account.currency} className="account-card__amount" />
      </div>

      <dl className="account-card__facts">
        <div>
          <dt>Tillgängligt</dt>
          <dd>
            <Money amount={account.availableBalance} currency={account.currency} />
          </dd>
        </div>
        <div>
          <dt>Reserverat</dt>
          <dd>
            <Money amount={account.reservedAmount} currency={account.currency} />
          </dd>
        </div>
      </dl>

      <div className="account-card__footer">
        {account.pendingPaymentCount > 0 ? (
          <Badge tone="warning" size="sm" dot>
            {account.pendingPaymentCount}{' '}
            {account.pendingPaymentCount === 1 ? 'betalning väntar' : 'betalningar väntar'} på attest
          </Badge>
        ) : (
          <span className="text-muted">Inga väntande betalningar</span>
        )}
        <span className="account-card__cta" aria-hidden="true">
          Visa konto
          <LuArrowRight />
        </span>
      </div>
    </article>
  );
}
