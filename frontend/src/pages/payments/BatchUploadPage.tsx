import { Link } from '@tanstack/react-router';
import { Fragment, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  LuArrowLeft,
  LuCircleAlert,
  LuCircleCheck,
  LuDownload,
  LuFileSpreadsheet,
  LuFileUp,
  LuFolderOpen,
  LuRefreshCw,
  LuSend,
} from 'react-icons/lu';
import { useAccounts } from '../../api/accounts';
import { getErrorMessage } from '../../api/client';
import { useConfig } from '../../api/config';
import { batchValidationFromError, useCreateBatch, useValidateBatch } from '../../api/payments';
import type { AppConfig, BatchResult, BatchRow, BatchValidation } from '../../api/types';
import { RoleGate } from '../../auth/RoleGate';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { buttonClass } from '../../components/ui/buttonClass';
import { Card, CardBody, CardFooter, CardHeader } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { IbanText } from '../../components/ui/IbanText';
import { Money } from '../../components/ui/Money';
import { PageHeader } from '../../components/ui/PageHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { PaymentStatusBadge } from '../../components/ui/StatusBadge';
import { useToast } from '../../components/ui/toast/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import { cn } from '../../utils/cn';
import { BATCH_CSV_COLUMNS, buildBatchTemplateCsv } from '../../utils/csv';
import { saveText } from '../../utils/download';
import { formatFileSize, formatNumber, pluralize } from '../../utils/format';
import { formatMoney, isValidMoney } from '../../utils/money';
import '../../styles/pages/payments.css';

type BatchState =
  | { step: 'select' }
  | { step: 'validating'; file: File }
  | { step: 'validated'; file: File; validation: BatchValidation }
  | { step: 'done'; file: File; result: BatchResult };

function isFullyValid(validation: BatchValidation) {
  return (
    validation.fileErrors.length === 0 &&
    validation.rows.length > 0 &&
    validation.rows.every((row) => row.errors.length === 0)
  );
}

function fileFingerprint(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function downloadTemplate() {
  saveText(buildBatchTemplateCsv(1), 'exempel-batchbetalningar.csv');
}

export function BatchUploadPage() {
  return (
    <RoleGate permission="createPayments">
      <BatchUploadView />
    </RoleGate>
  );
}

function BatchUploadView() {
  useDocumentTitle('Batchuppladdning');
  const config = useConfig();
  const validateBatch = useValidateBatch();
  const createBatch = useCreateBatch();
  const idempotency = useIdempotencyKey();
  const toast = useToast();

  const [state, setState] = useState<BatchState>({ step: 'select' });
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function checkFile(file: File): string | null {
    if (!/\.csv$/i.test(file.name)) return 'Filen måste vara en CSV-fil (.csv).';
    if (file.size === 0) return 'Filen är tom.';
    if (config.data && file.size > config.data.maxBatchFileSizeBytes) {
      return `Filen är ${formatFileSize(file.size)} men får vara högst ${formatFileSize(config.data.maxBatchFileSizeBytes)}.`;
    }
    return null;
  }

  async function handleFile(file: File) {
    setCreateError(null);
    const problem = checkFile(file);
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError(null);
    idempotency.reset();
    setState({ step: 'validating', file });
    try {
      const validation = await validateBatch.mutateAsync(file);
      // Ignore the answer if another file was picked in the meantime.
      setState((current) =>
        current.step === 'validating' && current.file === file ? { step: 'validated', file, validation } : current,
      );
    } catch (error) {
      setState((current) => (current.step === 'validating' && current.file === file ? { step: 'select' } : current));
      setFileError(getErrorMessage(error, 'Filen kunde inte kontrolleras. Försök igen.'));
    }
  }

  async function handleCreate() {
    if (state.step !== 'validated') return;
    const { file } = state;
    const idempotencyKey = idempotency.keyFor(fileFingerprint(file));
    setCreateError(null);
    try {
      const result = await createBatch.mutateAsync({ file, idempotencyKey });
      idempotency.reset();
      setConfirmOpen(false);
      setState({ step: 'done', file, result });
      toast.success(`${pluralize(result.createdCount, 'betalning', 'betalningar')} har skapats.`);
      window.scrollTo({ top: 0 });
    } catch (error) {
      const validation = batchValidationFromError(error);
      if (validation) {
        setConfirmOpen(false);
        setState({ step: 'validated', file, validation });
        setCreateError('Filen innehåller fel, så inga betalningar skapades. Rätta raderna nedan och ladda upp filen igen.');
        return;
      }
      setCreateError(getErrorMessage(error, 'Betalningarna kunde inte skapas. Försök igen.'));
    }
  }

  function startOver() {
    setState({ step: 'select' });
    setFileError(null);
    setCreateError(null);
    idempotency.reset();
  }

  return (
    <div className="page">
      <PageHeader
        title="Batchuppladdning"
        description="Skapa många betalningar på en gång från en CSV-fil. Filen kontrolleras innan något skickas."
        back={
          <Link to="/payments" className="back-link">
            <LuArrowLeft aria-hidden="true" />
            Betalningar
          </Link>
        }
        actions={
          <Button variant="secondary" icon={LuDownload} onClick={downloadTemplate}>
            Ladda ner exempelfil
          </Button>
        }
      />

      {state.step === 'done' ? (
        <BatchResultView file={state.file} result={state.result} onUploadAnother={startOver} />
      ) : state.step === 'validated' ? (
        <>
          {createError && !confirmOpen && (
            <Alert tone="danger" title="Inga betalningar skapades" className="page-alert">
              {createError}
            </Alert>
          )}
          <ValidationView
            file={state.file}
            validation={state.validation}
            onCreate={() => {
              setCreateError(null);
              setConfirmOpen(true);
            }}
            onUploadAnother={startOver}
          />
        </>
      ) : (
        <div className="batch-layout">
          <div className="batch-layout__main">
            {fileError && (
              <Alert tone="danger" title="Filen kan inte användas" className="page-alert" onDismiss={() => setFileError(null)}>
                {fileError}
              </Alert>
            )}
            <Dropzone
              busyFile={state.step === 'validating' ? state.file : null}
              config={config.data}
              configLoading={config.isPending}
              onFile={(file) => void handleFile(file)}
              onError={setFileError}
            />
          </div>
          <FormatHelp config={config.data} />
        </div>
      )}

      {confirmOpen && state.step === 'validated' && (
        <Dialog
          open
          onClose={() => setConfirmOpen(false)}
          title={`Skapa ${pluralize(state.validation.rowCount, 'betalning', 'betalningar')}?`}
          description={`Från filen ${state.validation.fileName || state.file.name}.`}
          dismissible={!createBatch.isPending}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={createBatch.isPending}>
                Avbryt
              </Button>
              <Button icon={LuSend} onClick={() => void handleCreate()} loading={createBatch.isPending}>
                {createError ? 'Försök igen' : `Skapa ${formatNumber(state.validation.rowCount)} betalningar`}
              </Button>
            </>
          }
        >
          {createError && <Alert tone="danger">{createError}</Alert>}
          <div className="decision-summary">
            <p className="decision-summary__label">Totalt belopp</p>
            <p className="decision-summary__amount">
              <Money amount={state.validation.totalAmount} />
            </p>
          </div>
          <ul className="plain-list">
            <li>
              <strong>{formatNumber(state.validation.directPaymentCount)}</strong> genomförs direkt och dras från kontona.
            </li>
            <li>
              <strong>{formatNumber(state.validation.approvalRequiredCount)}</strong> kräver attest innan de genomförs.
            </li>
          </ul>
          <Alert tone="info">Alla rader skapas samtidigt. Om något går fel skapas ingen av betalningarna.</Alert>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Dropzone

function Dropzone({
  busyFile,
  config,
  configLoading,
  onFile,
  onError,
}: {
  busyFile: File | null;
  config: AppConfig | undefined;
  configLoading: boolean;
  onFile: (file: File) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = busyFile !== null;

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const files = event.dataTransfer.files;
    if (files.length > 1) {
      onError('Släpp en fil i taget.');
      return;
    }
    if (files[0]) onFile(files[0]);
  }

  return (
    <Card>
      <div
        className={cn('dropzone', dragging && 'is-dragging', busy && 'is-busy')}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        {busy ? (
          <div className="dropzone__busy" role="status">
            <Spinner size="lg" />
            <p className="dropzone__title">Kontrollerar {busyFile.name}…</p>
            <p className="dropzone__text">Format, konton, IBAN och belopp kontrolleras. Inget skickas ännu.</p>
          </div>
        ) : (
          <>
            <span className="dropzone__icon">
              <LuFileUp aria-hidden="true" />
            </span>
            <p className="dropzone__title">Dra och släpp din CSV-fil här</p>
            <p className="dropzone__text">eller</p>
            <Button variant="secondary" icon={LuFolderOpen} onClick={() => inputRef.current?.click()}>
              Välj fil
            </Button>
            <p className="dropzone__hint">
              {configLoading ? (
                <Skeleton width={220} height={12} />
              ) : config ? (
                `CSV-fil, högst ${formatFileSize(config.maxBatchFileSizeBytes)} och ${formatNumber(config.maxBatchRows)} rader.`
              ) : (
                'CSV-fil med en betalning per rad.'
              )}
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so picking the same file again still triggers a change.
            event.target.value = '';
            if (file) onFile(file);
          }}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Format help

const COLUMN_HELP: Record<(typeof BATCH_CSV_COLUMNS)[number], string> = {
  from_account_id: 'Id för kontot som betalningen dras från.',
  to_iban: 'Mottagarens IBAN, med eller utan mellanslag.',
  amount: 'Belopp med punkt som decimaltecken, till exempel 5000.00.',
  reference: 'Valfri referens, högst 100 tecken. Använd citattecken om texten innehåller komma.',
};

function FormatHelp({ config }: { config: AppConfig | undefined }) {
  const accounts = useAccounts();
  return (
    <aside className="batch-layout__aside" aria-label="Hjälp med filformatet">
      <Card>
        <CardHeader title="Filformat" divider />
        <CardBody className="format-help">
          <p>En rad per betalning med kommatecken mellan fälten. Första raden ska vara rubrikerna:</p>
          <dl className="format-help__columns">
            {BATCH_CSV_COLUMNS.map((column) => (
              <div key={column}>
                <dt>
                  <code>{column}</code>
                </dt>
                <dd>{COLUMN_HELP[column]}</dd>
              </div>
            ))}
          </dl>
          <pre className="code-block">
            {`from_account_id,to_iban,amount,reference\n1,SE3550000000054910000003,5000.00,"Malmö Bygg, faktura 99"`}
          </pre>
          {config && (
            <p className="format-help__note">
              Rader över {formatMoney(config.approvalThreshold, config.currency)} kräver attest och rader över{' '}
              {formatMoney(config.doubleApprovalThreshold, config.currency)} dubbel attest.
            </p>
          )}
          <Button variant="secondary" icon={LuDownload} onClick={downloadTemplate} block>
            Ladda ner exempelfil
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Kontonas id" description="Använd id:t i kolumnen from_account_id." divider />
        {accounts.isPending ? (
          <CardBody>
            <Skeleton width="80%" />
          </CardBody>
        ) : accounts.isError ? (
          <CardBody>
            <p className="text-muted">{getErrorMessage(accounts.error)}</p>
          </CardBody>
        ) : (
          <div className="table-wrap">
            <table className="table table--compact">
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Konto</th>
                  <th scope="col" className="num">
                    Tillgängligt
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.data.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <code>{account.id}</code>
                    </td>
                    <td>{account.accountName}</td>
                    <td className="num nowrap">
                      <Money amount={account.availableBalance} currency={account.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </aside>
  );
}

// ---------------------------------------------------------------- Validation result

function RowAmount({ amount }: { amount: string | null }) {
  if (!amount) return <span className="text-subtle">–</span>;
  return isValidMoney(amount) ? <Money amount={amount} /> : <span className="raw-value">{amount}</span>;
}

function ValidationView({
  file,
  validation,
  onCreate,
  onUploadAnother,
}: {
  file: File;
  validation: BatchValidation;
  onCreate: () => void;
  onUploadAnother: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'invalid'>('all');
  const valid = isFullyValid(validation);
  const invalidRows = validation.rows.filter((row) => row.errors.length > 0);
  const rows: BatchRow[] = filter === 'invalid' ? invalidRows : validation.rows;
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [validation]);

  return (
    <div className="batch-result">
      <Card>
        <div className="file-bar">
          <span className={cn('file-bar__icon', valid ? 'tone-success' : 'tone-danger')}>
            <LuFileSpreadsheet aria-hidden="true" />
          </span>
          <div className="file-bar__text">
            <h2 className="file-bar__name" ref={headingRef} tabIndex={-1}>
              {validation.fileName || file.name}
            </h2>
            <p className="file-bar__meta">
              {formatFileSize(file.size)} · {valid ? 'Klar att skicka' : 'Innehåller fel'}
            </p>
          </div>
          <Button variant="ghost" size="sm" icon={LuRefreshCw} onClick={onUploadAnother}>
            Ladda upp en annan fil
          </Button>
        </div>
        <div className="summary-tiles">
          <SummaryTile label="Rader" value={formatNumber(validation.rowCount)} />
          <SummaryTile label="Giltiga" value={formatNumber(validation.validRowCount)} tone="success" />
          <SummaryTile
            label="Med fel"
            value={formatNumber(validation.invalidRowCount)}
            tone={validation.invalidRowCount > 0 ? 'danger' : undefined}
          />
          <SummaryTile label="Totalt belopp" value={<Money amount={validation.totalAmount} />} />
          <SummaryTile label="Genomförs direkt" value={formatNumber(validation.directPaymentCount)} />
          <SummaryTile label="Kräver attest" value={formatNumber(validation.approvalRequiredCount)} />
        </div>
      </Card>

      {validation.fileErrors.length > 0 && (
        <Alert tone="danger" title="Filen kunde inte läsas in korrekt">
          <ul className="plain-list">
            {validation.fileErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}
      {validation.fileErrors.length === 0 && invalidRows.length > 0 && (
        <Alert tone="warning" title={`${pluralize(invalidRows.length, 'rad', 'rader')} innehåller fel`}>
          Rätta felen i filen och ladda upp den igen. Inga betalningar skapas förrän hela filen är giltig.
        </Alert>
      )}
      {valid && (
        <Alert tone="success" title="Filen är giltig">
          {pluralize(validation.rowCount, 'betalning', 'betalningar')} på totalt {formatMoney(validation.totalAmount)} kan
          skapas.
        </Alert>
      )}

      {validation.rows.length > 0 && (
        <Card>
          <CardHeader
            title="Rader i filen"
            actions={
              invalidRows.length > 0 && (
                <SegmentedControl
                  label="Visa rader"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: `Alla (${formatNumber(validation.rows.length)})` },
                    { value: 'invalid', label: `Med fel (${formatNumber(invalidRows.length)})` },
                  ]}
                />
              )
            }
          />
          <div className="table-wrap">
            <table className="table table--wide batch-table">
              <caption className="visually-hidden">Kontrollerade rader i filen</caption>
              <thead>
                <tr>
                  <th scope="col">Rad</th>
                  <th scope="col">Från konto</th>
                  <th scope="col">Mottagare</th>
                  <th scope="col" className="num">
                    Belopp
                  </th>
                  <th scope="col">Referens</th>
                  <th scope="col">Hantering</th>
                  <th scope="col">Kontroll</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hasErrors = row.errors.length > 0;
                  const errorsId = `batch-row-${row.rowNumber}-errors`;
                  return (
                    <Fragment key={row.rowNumber}>
                      <tr className={cn(hasErrors && 'is-invalid')} aria-describedby={hasErrors ? errorsId : undefined}>
                        <td>
                          <code>{row.rowNumber}</code>
                        </td>
                        <td className="nowrap">
                          {row.fromAccountName ??
                            (row.fromAccountId !== null ? `Konto ${row.fromAccountId}` : <span className="text-subtle">–</span>)}
                        </td>
                        <td className="nowrap">
                          {row.toIban ? <IbanText iban={row.toIban} /> : <span className="text-subtle">–</span>}
                        </td>
                        <td className="num nowrap">
                          <RowAmount amount={row.amount} />
                        </td>
                        <td className="cell-wrap">{row.reference || <span className="text-subtle">–</span>}</td>
                        <td className="nowrap">
                          {hasErrors ? (
                            <span className="text-subtle">–</span>
                          ) : row.requiresApproval ? (
                            <Badge tone="warning" size="sm">
                              Kräver attest
                            </Badge>
                          ) : (
                            <Badge tone="success" size="sm">
                              Direkt
                            </Badge>
                          )}
                        </td>
                        <td className="nowrap">
                          {hasErrors ? (
                            <span className="row-status row-status--error">
                              <LuCircleAlert aria-hidden="true" />
                              {pluralize(row.errors.length, 'fel', 'fel')}
                            </span>
                          ) : (
                            <span className="row-status row-status--ok">
                              <LuCircleCheck aria-hidden="true" />
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                      {hasErrors && (
                        <tr className="is-invalid row-errors-row">
                          <td colSpan={7}>
                            <ul className="row-errors" id={errorsId}>
                              {row.errors.map((error) => (
                                <li key={error}>
                                  <LuCircleAlert aria-hidden="true" />
                                  <span>
                                    Rad {row.rowNumber}: {error}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CardFooter className="form-actions">
            {!valid && <p className="form-actions__hint">Rätta felen i filen och ladda upp den igen.</p>}
            <Button variant="secondary" icon={LuRefreshCw} onClick={onUploadAnother}>
              Ladda upp en annan fil
            </Button>
            <Button icon={LuSend} onClick={onCreate} disabled={!valid}>
              Skapa {pluralize(validation.rowCount, 'betalning', 'betalningar')}
            </Button>
          </CardFooter>
        </Card>
      )}

      {validation.rows.length === 0 && (
        <div className="form-actions form-actions--standalone">
          <Button variant="secondary" icon={LuRefreshCw} onClick={onUploadAnother}>
            Ladda upp en annan fil
          </Button>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className={cn('summary-tile', tone && `summary-tile--${tone}`)}>
      <span className="summary-tile__label">{label}</span>
      <span className="summary-tile__value">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Result

function BatchResultView({
  file,
  result,
  onUploadAnother,
}: {
  file: File;
  result: BatchResult;
  onUploadAnother: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div className="batch-result">
      <Card className="result-card">
        <span className="result-card__icon tone-success">
          <LuCircleCheck aria-hidden="true" />
        </span>
        <h2 className="result-card__title" ref={titleRef} tabIndex={-1}>
          {pluralize(result.createdCount, 'betalning', 'betalningar')} har skapats
        </h2>
        <p className="result-card__text">Alla rader i {file.name} har blivit betalningar.</p>
        <div className="summary-tiles summary-tiles--compact">
          <SummaryTile label="Genomförda direkt" value={formatNumber(result.completedCount)} tone="success" />
          <SummaryTile label="Väntar på attest" value={formatNumber(result.pendingApprovalCount)} />
          <SummaryTile label="Totalt belopp" value={<Money amount={result.totalAmount} />} />
        </div>
        <div className="result-card__actions">
          <Link to="/payments" className={buttonClass()}>
            Visa betalningar
          </Link>
          {result.pendingApprovalCount > 0 && (
            <Link to="/payments" search={{ status: 'pending_approval' }} className={buttonClass({ variant: 'secondary' })}>
              Visa väntande
            </Link>
          )}
          <Button variant="secondary" icon={LuRefreshCw} onClick={onUploadAnother}>
            Ladda upp en annan fil
          </Button>
        </div>
      </Card>

      {result.payments.length > 0 && (
        <Card>
          <CardHeader title="Skapade betalningar" />
          <div className="table-wrap">
            <table className="table table--wide">
              <caption className="visually-hidden">Betalningar som skapades från filen</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Referens</th>
                  <th scope="col">Mottagare</th>
                  <th scope="col" className="num">
                    Belopp
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <Link to="/payments/$paymentId" params={{ paymentId: payment.id }} className="cell-link">
                        #{payment.id}
                      </Link>
                    </td>
                    <td className="cell-wrap">{payment.reference || <span className="text-subtle">Utan referens</span>}</td>
                    <td className="nowrap">
                      <IbanText iban={payment.toIban} />
                    </td>
                    <td className="num nowrap">
                      <Money amount={payment.amount} currency={payment.currency} />
                    </td>
                    <td className="nowrap">
                      <PaymentStatusBadge status={payment.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
