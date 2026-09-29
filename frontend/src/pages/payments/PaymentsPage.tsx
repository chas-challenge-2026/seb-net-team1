import { Link, getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { LuDownload, LuFilterX, LuPlus, LuSearchX, LuUpload } from 'react-icons/lu';
import { useAccounts } from '../../api/accounts';
import { getErrorMessage } from '../../api/client';
import { downloadPaymentsExport, usePayments } from '../../api/payments';
import type { PaymentStatus } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PaymentsTable } from '../../components/payments/PaymentsTable';
import { Button } from '../../components/ui/Button';
import { buttonClass } from '../../components/ui/buttonClass';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Checkbox, Input, Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { SearchField } from '../../components/ui/SearchField';
import { TabPanel, Tabs, type TabItem } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/toast/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { PaymentsSearch } from '../../routes/searchSchemas';
import { pluralize } from '../../utils/format';
import '../../styles/pages/payments.css';

const routeApi = getRouteApi('/app/payments');
const PAGE_SIZE = 20;

type StatusTab = 'all' | PaymentStatus;

const STATUS_TABS: TabItem<StatusTab>[] = [
  { id: 'all', label: 'Alla' },
  { id: 'pending_approval', label: 'Väntar på attest' },
  { id: 'completed', label: 'Genomförda' },
  { id: 'rejected', label: 'Avvisade' },
];

export function PaymentsPage() {
  useDocumentTitle('Betalningar');
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { canCreatePayments } = useAuth();
  const toast = useToast();
  const accounts = useAccounts();
  const [exporting, setExporting] = useState(false);

  const page = search.page ?? 1;
  const filters = {
    status: search.status,
    accountId: search.accountId,
    search: search.search,
    fromDate: search.fromDate,
    toDate: search.toDate,
    createdByMe: search.mine,
  };
  const payments = usePayments({ ...filters, page, pageSize: PAGE_SIZE });

  const hasFilters = Boolean(search.accountId || search.search || search.fromDate || search.toDate || search.mine);
  const tab: StatusTab = search.status ?? 'all';

  function updateSearch(patch: Partial<PaymentsSearch>, replace = false) {
    // Any filter change starts over on the first page.
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: undefined }), replace });
  }

  function clearFilters() {
    void navigate({ search: (previous) => ({ status: previous.status }) });
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadPaymentsExport(filters);
      toast.success('Exporten har laddats ner.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Exporten kunde inte skapas. Försök igen.'));
    } finally {
      setExporting(false);
    }
  }

  const data = payments.data;
  const pageOutOfRange = data !== undefined && data.items.length === 0 && page > 1;

  return (
    <div className="page">
      <PageHeader
        title="Betalningar"
        description="Alla betalningar i företaget, de senaste först."
        actions={
          <>
            <Button variant="secondary" icon={LuDownload} onClick={() => void handleExport()} loading={exporting}>
              Exportera CSV
            </Button>
            {canCreatePayments && (
              <>
                <Link to="/payments/batch" className={buttonClass({ variant: 'secondary' })}>
                  <LuUpload aria-hidden="true" />
                  Batchuppladdning
                </Link>
                <Link to="/payments/new" className={buttonClass()}>
                  <LuPlus aria-hidden="true" />
                  Ny betalning
                </Link>
              </>
            )}
          </>
        }
      />

      <Card>
        <div className="list-toolbar">
          <Tabs
            idPrefix="payments"
            label="Filtrera på status"
            items={STATUS_TABS}
            value={tab}
            onChange={(next) => updateSearch({ status: next === 'all' ? undefined : next })}
          />
        </div>

        <div className="filter-bar">
          <Select
            label="Konto"
            containerClassName="filter-bar__account"
            value={search.accountId ?? ''}
            onChange={(event) => updateSearch({ accountId: event.target.value ? Number(event.target.value) : undefined })}
            disabled={accounts.isPending}
          >
            <option value="">Alla konton</option>
            {accounts.data?.map((account) => (
              <option key={account.id} value={account.id}>
                {account.accountName}
              </option>
            ))}
          </Select>
          <Input
            label="Från datum"
            type="date"
            containerClassName="filter-bar__date"
            value={search.fromDate ?? ''}
            max={search.toDate}
            onChange={(event) => updateSearch({ fromDate: event.target.value || undefined })}
          />
          <Input
            label="Till datum"
            type="date"
            containerClassName="filter-bar__date"
            value={search.toDate ?? ''}
            min={search.fromDate}
            onChange={(event) => updateSearch({ toDate: event.target.value || undefined })}
          />
          <div className="filter-bar__search">
            <SearchField
              label="Sök betalningar"
              hideLabel={false}
              placeholder="Referens, IBAN eller id"
              value={search.search}
              onChange={(value) => updateSearch({ search: value }, true)}
            />
          </div>
          <Checkbox
            className="filter-bar__mine"
            label="Endast mina"
            checked={search.mine ?? false}
            onChange={(event) => updateSearch({ mine: event.target.checked || undefined })}
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" icon={LuFilterX} onClick={clearFilters} className="filter-bar__clear">
              Rensa filter
            </Button>
          )}
        </div>

        <TabPanel idPrefix="payments" tab={tab}>
          {payments.isError ? (
            <ErrorState
              error={payments.error}
              title="Betalningarna kunde inte hämtas"
              onRetry={() => void payments.refetch()}
              retrying={payments.isFetching}
            />
          ) : pageOutOfRange ? (
            <EmptyState
              title="Sidan finns inte"
              description="Det finns inga betalningar på den här sidan."
              action={
                <Button variant="secondary" onClick={() => updateSearch({})}>
                  Till första sidan
                </Button>
              }
            />
          ) : (
            <>
              {data && (
                <p className="list-summary" aria-live="polite">
                  {pluralize(data.totalCount, 'betalning', 'betalningar')}
                </p>
              )}
              <PaymentsTable
                caption="Betalningar"
                payments={data?.items}
                loading={payments.isPending}
                refetching={payments.isPlaceholderData}
                empty={
                  hasFilters || search.status ? (
                    <EmptyState
                      icon={LuSearchX}
                      title="Inga betalningar matchar"
                      description="Prova att ändra eller rensa filtren."
                      action={
                        hasFilters ? (
                          <Button variant="secondary" icon={LuFilterX} onClick={clearFilters}>
                            Rensa filter
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <EmptyState
                      title="Inga betalningar ännu"
                      description="När företaget gör sin första betalning visas den här."
                      action={
                        canCreatePayments ? (
                          <Link to="/payments/new" className={buttonClass()}>
                            <LuPlus aria-hidden="true" />
                            Ny betalning
                          </Link>
                        ) : undefined
                      }
                    />
                  )
                }
              />
              {data && (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalCount={data.totalCount}
                  onPageChange={(next) => void navigate({ search: (previous) => ({ ...previous, page: next > 1 ? next : undefined }) })}
                />
              )}
            </>
          )}
        </TabPanel>
      </Card>
    </div>
  );
}
