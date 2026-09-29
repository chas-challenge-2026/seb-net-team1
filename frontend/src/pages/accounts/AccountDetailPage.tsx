import { Link, getRouteApi } from '@tanstack/react-router';
import { LuArrowDownLeft, LuArrowLeft, LuArrowRight, LuArrowUpRight, LuPlus, LuReceipt, LuSearchX } from 'react-icons/lu';
import { useAccount, useAccountTransactions } from '../../api/accounts';
import { isApiError } from '../../api/client';
import { usePayments } from '../../api/payments';
import type { Account } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PaymentsTable } from '../../components/payments/PaymentsTable';
import { buttonClass } from '../../components/ui/buttonClass';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { IbanText } from '../../components/ui/IbanText';
import { Money } from '../../components/ui/Money';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { Skeleton, SkeletonRows } from '../../components/ui/Skeleton';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { cn } from '../../utils/cn';
import { formatDate, formatTime } from '../../utils/date';
import { formatNumber } from '../../utils/format';
import { TRANSACTION_TYPE_LABELS } from '../../utils/labels';
import '../../styles/pages/accounts.css';

const routeApi = getRouteApi('/app/accounts/$accountId');
const PAGE_SIZE = 20;

type AccountTab = 'transactions' | 'payments';

function BackLink() {
  return (
    <Link to="/accounts" className="back-link">
      <LuArrowLeft aria-hidden="true" />
      Konton
    </Link>
  );
}

export function AccountDetailPage() {
  const { accountId } = routeApi.useParams();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { canCreatePayments } = useAuth();
  const validId = Number.isInteger(accountId) && accountId > 0;
  const account = useAccount(accountId, { enabled: validId });
  useDocumentTitle(account.data?.accountName ?? 'Konto');

  const tab: AccountTab = search.tab ?? 'transactions';
  const page = search.page ?? 1;

  if (!validId || isApiError(account.error, 404)) {
    return (
      <div className="page">
        <PageHeader title="Kontot hittades inte" back={<BackLink />} />
        <Card>
          <EmptyState
            icon={LuSearchX}
            title="Kontot finns inte"
            description="Kontrollera länken. Kontot kan också tillhöra ett annat företag."
            action={
              <Link to="/accounts" className={buttonClass({ variant: 'secondary' })}>
                Till kontona
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  if (account.isError) {
    return (
      <div className="page">
        <PageHeader title="Konto" back={<BackLink />} />
        <Card>
          <ErrorState
            error={account.error}
            title="Kontot kunde inte hämtas"
            onRetry={() => void account.refetch()}
            retrying={account.isFetching}
          />
        </Card>
      </div>
    );
  }

  const data = account.data;

  return (
    <div className="page">
      <PageHeader
        back={<BackLink />}
        title={data ? data.accountName : <Skeleton width={220} height={28} />}
        description={data ? <IbanText iban={data.iban} copyable /> : <Skeleton width={260} />}
        actions={
          canCreatePayments &&
          data && (
            <Link to="/payments/new" search={{ fromAccountId: data.id }} className={buttonClass()}>
              <LuPlus aria-hidden="true" />
              Ny betalning från kontot
            </Link>
          )
        }
      />

      <BalanceStrip account={data} />

      <Card>
        <div className="list-toolbar">
          <Tabs<AccountTab>
            idPrefix="account"
            label="Kontots innehåll"
            value={tab}
            onChange={(next) => void navigate({ search: { tab: next === 'transactions' ? undefined : next } })}
            items={[
              { id: 'transactions', label: 'Transaktioner' },
              { id: 'payments', label: 'Betalningar' },
            ]}
          />
        </div>
        <TabPanel idPrefix="account" tab={tab}>
          {tab === 'transactions' ? (
            <TransactionsTab
              accountId={accountId}
              currency={data?.currency ?? 'SEK'}
              page={page}
              onPageChange={(next) => void navigate({ search: (previous) => ({ ...previous, page: next > 1 ? next : undefined }) })}
            />
          ) : (
            <PaymentsTab
              accountId={accountId}
              page={page}
              onPageChange={(next) => void navigate({ search: (previous) => ({ ...previous, page: next > 1 ? next : undefined }) })}
            />
          )}
        </TabPanel>
      </Card>
    </div>
  );
}

function BalanceStrip({ account }: { account: Account | undefined }) {
  const items = [
    { label: 'Saldo', value: account && <Money amount={account.balance} currency={account.currency} />, primary: true },
    { label: 'Tillgängligt', value: account && <Money amount={account.availableBalance} currency={account.currency} /> },
    { label: 'Reserverat', value: account && <Money amount={account.reservedAmount} currency={account.currency} /> },
    { label: 'Väntande betalningar', value: account && formatNumber(account.pendingPaymentCount) },
  ];
  return (
    <Card className="balance-strip">
      {items.map((item) => (
        <div key={item.label} className={cn('balance-strip__item', item.primary && 'is-primary')}>
          <span className="balance-strip__label">{item.label}</span>
          <span className="balance-strip__value">{item.value ?? <Skeleton width={120} height={22} />}</span>
        </div>
      ))}
    </Card>
  );
}

function TransactionsTab({
  accountId,
  currency,
  page,
  onPageChange,
}: {
  accountId: number;
  currency: string;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const transactions = useAccountTransactions(accountId, page, PAGE_SIZE);
  const data = transactions.data;

  if (transactions.isError) {
    return (
      <ErrorState
        error={transactions.error}
        title="Transaktionerna kunde inte hämtas"
        onRetry={() => void transactions.refetch()}
        retrying={transactions.isFetching}
      />
    );
  }

  if (data && data.items.length === 0) {
    return (
      <EmptyState
        icon={LuReceipt}
        title={page > 1 ? 'Sidan finns inte' : 'Inga transaktioner'}
        description={page > 1 ? 'Det finns inga transaktioner på den här sidan.' : 'Insättningar och genomförda betalningar visas här.'}
        action={
          page > 1 ? (
            <button type="button" className={buttonClass({ variant: 'secondary' })} onClick={() => onPageChange(1)}>
              Till första sidan
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <div
        className={cn('table-wrap', transactions.isPlaceholderData && 'is-refetching')}
        aria-busy={transactions.isPending || transactions.isPlaceholderData || undefined}
      >
        <table className="table table--wide">
          <caption className="visually-hidden">Kontots transaktioner, de senaste först</caption>
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col">Beskrivning</th>
              <th scope="col">Typ</th>
              <th scope="col" className="num">
                Belopp
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.isPending ? (
              <SkeletonRows rows={8} columns={4} />
            ) : (
              data?.items.map((transaction) => {
                const incoming = !transaction.amount.trim().startsWith('-');
                return (
                  <tr key={transaction.id}>
                    <td className="nowrap">
                      <span className="cell-primary">{formatDate(transaction.date)}</span>
                      <span className="cell-secondary">{formatTime(transaction.date)}</span>
                    </td>
                    <td className="cell-wrap">
                      <span className="cell-primary">{transaction.description}</span>
                      {transaction.paymentId !== null && (
                        <Link
                          to="/payments/$paymentId"
                          params={{ paymentId: transaction.paymentId }}
                          className="cell-secondary cell-link-secondary"
                        >
                          Betalning #{transaction.paymentId}
                        </Link>
                      )}
                    </td>
                    <td className="nowrap">
                      <span className={cn('transaction-type', incoming ? 'transaction-type--in' : 'transaction-type--out')}>
                        {incoming ? <LuArrowDownLeft aria-hidden="true" /> : <LuArrowUpRight aria-hidden="true" />}
                        {TRANSACTION_TYPE_LABELS[transaction.transactionType] ?? transaction.transactionType}
                      </span>
                    </td>
                    <td className="num nowrap">
                      <Money amount={transaction.amount} currency={currency} signed colored />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={data.totalCount} onPageChange={onPageChange} />}
    </>
  );
}

function PaymentsTab({
  accountId,
  page,
  onPageChange,
}: {
  accountId: number;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const payments = usePayments({ accountId, page, pageSize: PAGE_SIZE });
  const data = payments.data;

  if (payments.isError) {
    return (
      <ErrorState
        error={payments.error}
        title="Betalningarna kunde inte hämtas"
        onRetry={() => void payments.refetch()}
        retrying={payments.isFetching}
      />
    );
  }

  return (
    <>
      <PaymentsTable
        caption="Betalningar från kontot"
        payments={data?.items}
        loading={payments.isPending}
        refetching={payments.isPlaceholderData}
        showAccount={false}
        empty={
          <EmptyState
            title={page > 1 ? 'Sidan finns inte' : 'Inga betalningar från kontot'}
            description={page > 1 ? 'Det finns inga betalningar på den här sidan.' : 'Betalningar som görs från kontot visas här.'}
          />
        }
      />
      {data && data.totalCount > 0 && (
        <div className="table-footer">
          <Pagination page={page} pageSize={PAGE_SIZE} totalCount={data.totalCount} onPageChange={onPageChange} />
          <Link to="/payments" search={{ accountId }} className="section-link">
            Visa i Betalningar
            <LuArrowRight aria-hidden="true" />
          </Link>
        </div>
      )}
    </>
  );
}
