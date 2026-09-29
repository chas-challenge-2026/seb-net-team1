import { Link, getRouteApi } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  LuArrowLeft,
  LuArrowRight,
  LuCircleAlert,
  LuCircleCheck,
  LuCircleX,
  LuClock,
  LuLandmark,
  LuPlus,
  LuSend,
  LuStamp,
  LuUsers,
} from 'react-icons/lu';
import { z } from 'zod';
import { useAccounts } from '../../api/accounts';
import { getErrorMessage } from '../../api/client';
import { useConfig } from '../../api/config';
import { useCreatePayment } from '../../api/payments';
import type { Account, AppConfig, CreatePaymentRequest, PaymentResponse } from '../../api/types';
import { useIbanValidation } from '../../api/validation';
import { RoleGate } from '../../auth/RoleGate';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { buttonClass } from '../../components/ui/buttonClass';
import { Card, CardBody, CardFooter, CardHeader } from '../../components/ui/Card';
import { DescriptionList } from '../../components/ui/DescriptionList';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Input, Select } from '../../components/ui/Field';
import { IbanText } from '../../components/ui/IbanText';
import { Money } from '../../components/ui/Money';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { PaymentStatusBadge } from '../../components/ui/StatusBadge';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import { cn } from '../../utils/cn';
import { IBAN_EXAMPLE, MAX_IBAN_LENGTH, formatIban, validateIban } from '../../utils/iban';
import { formatAmountForInput, formatMoney, moneyToCents, parseAmountInput } from '../../utils/money';
import { focusFirstError, validateForm } from '../../utils/validation';
import '../../styles/pages/payments.css';

const routeApi = getRouteApi('/app/payments/new');

const MAX_REFERENCE_LENGTH = 100;

type FormValues = { fromAccountId: string; iban: string; amount: string; reference: string };
type FieldName = keyof FormValues;

/** How the payment will be handled, from the thresholds in /api/config. */
type Outcome = 'direct' | 'single' | 'double';

const paymentSchema = z.object({
  fromAccountId: z.string().min(1, 'Välj vilket konto betalningen ska dras från.'),
  iban: z.string().superRefine((value, context) => {
    const check = validateIban(value);
    if (!check.valid) context.addIssue({ code: 'custom', message: check.message });
  }),
  amount: z.string().superRefine((value, context) => {
    const parsed = parseAmountInput(value);
    if (!parsed.ok) context.addIssue({ code: 'custom', message: parsed.error });
  }),
  reference: z
    .string()
    .max(MAX_REFERENCE_LENGTH, `Referensen får vara högst ${MAX_REFERENCE_LENGTH} tecken.`),
});

const OUTCOME_LABELS: Record<Outcome, string> = {
  direct: 'Genomförs direkt',
  single: 'Kräver attest',
  double: 'Kräver dubbel attest',
};

function outcomeFor(amountCents: number | null, config: AppConfig | undefined): Outcome | null {
  if (amountCents === null || !config) return null;
  if (amountCents > moneyToCents(config.doubleApprovalThreshold)) return 'double';
  if (amountCents > moneyToCents(config.approvalThreshold)) return 'single';
  return 'direct';
}

export function NewPaymentPage() {
  return (
    <RoleGate permission="createPayments">
      <NewPaymentView />
    </RoleGate>
  );
}

interface CreatedPayment {
  payment: PaymentResponse;
  accountName: string;
  outcome: Outcome | null;
}

function NewPaymentView() {
  useDocumentTitle('Ny betalning');
  const search = routeApi.useSearch();
  const accounts = useAccounts();
  const config = useConfig();
  const createPayment = useCreatePayment();
  const idempotency = useIdempotencyKey();

  const [values, setValues] = useState<FormValues>({
    fromAccountId: search.fromAccountId ? String(search.fromAccountId) : '',
    iban: '',
    amount: '',
    reference: '',
  });
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedPayment | null>(null);

  // ---- Derived state (validated on every render, errors shown once a field is touched)
  const selectedAccount = accounts.data?.find((account) => String(account.id) === values.fromAccountId);
  const validation = validateForm(paymentSchema, {
    ...values,
    fromAccountId: selectedAccount ? values.fromAccountId : '',
  });
  const errors = validation.errors;

  const ibanCheck = validateIban(values.iban);
  const debouncedIban = useDebouncedValue(ibanCheck.valid ? ibanCheck.normalized : null, 400);
  const serverIban = useIbanValidation(ibanCheck.valid ? debouncedIban : null);
  const serverIbanRejected =
    ibanCheck.valid && serverIban.data?.normalized === ibanCheck.normalized && !serverIban.data.valid;
  const ibanError = errors.iban ?? (serverIbanRejected ? serverIban.data?.message : undefined);
  const ibanComplete = ibanCheck.expectedLength !== null && ibanCheck.normalized.length >= ibanCheck.expectedLength;
  const showIbanError = Boolean(
    ibanError && (submitted || touched.iban || ibanComplete || (values.iban && ibanCheck.errorCode === 3)),
  );
  const ibanValid = ibanCheck.valid && !serverIbanRejected;

  const amountParsed = parseAmountInput(values.amount);
  const amountCents = amountParsed.ok ? moneyToCents(amountParsed.value) : null;
  const outcome = outcomeFor(amountCents, config.data);
  const exceedsAvailable =
    selectedAccount !== undefined && amountCents !== null && amountCents > moneyToCents(selectedAccount.availableBalance);

  const visibleError = (field: FieldName) => (submitted || touched[field] ? errors[field] : undefined);
  const canSubmit = validation.success && !serverIbanRejected;

  // ---- Handlers
  function setField(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setServerError(null);
  }

  function markTouched(field: FieldName) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function handleIbanChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const caret = input.selectionStart ?? input.value.length;
    const significantBeforeCaret = input.value.slice(0, caret).replace(/[\s-]/g, '').length;
    const formatted = formatIban(input.value).slice(0, MAX_IBAN_LENGTH + Math.floor(MAX_IBAN_LENGTH / 4));
    setField('iban', formatted);

    // Grouping inserts spaces; put the caret back after the same character.
    if (document.activeElement === input) {
      window.requestAnimationFrame(() => {
        let position = 0;
        let seen = 0;
        while (position < formatted.length && seen < significantBeforeCaret) {
          if (formatted[position] !== ' ') seen += 1;
          position += 1;
        }
        input.setSelectionRange(position, position);
      });
    }
  }

  function handleAmountBlur() {
    markTouched('amount');
    if (amountParsed.ok) setValues((current) => ({ ...current, amount: formatAmountForInput(amountParsed.value) }));
  }

  function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!canSubmit) {
      focusFirstError({ ...errors, iban: ibanError }, 'payment-');
      return;
    }
    setServerError(null);
    setReviewOpen(true);
  }

  async function handleConfirm() {
    if (!canSubmit || !selectedAccount || !amountParsed.ok) return;
    const body: CreatePaymentRequest = {
      fromAccountId: selectedAccount.id,
      toIban: ibanCheck.normalized,
      amount: amountParsed.value,
      reference: values.reference.trim() || undefined,
    };
    // Retrying the exact same payment (e.g. after a network error) reuses the key,
    // so the backend can never create it twice.
    const idempotencyKey = idempotency.keyFor(JSON.stringify(body));
    setServerError(null);
    try {
      const payment = await createPayment.mutateAsync({ body, idempotencyKey });
      idempotency.reset();
      setReviewOpen(false);
      setCreated({ payment, accountName: selectedAccount.accountName, outcome });
      window.scrollTo({ top: 0 });
    } catch (error) {
      setServerError(getErrorMessage(error, 'Betalningen kunde inte skapas. Försök igen.'));
    }
  }

  function startOver() {
    setValues((current) => ({ fromAccountId: current.fromAccountId, iban: '', amount: '', reference: '' }));
    setTouched({});
    setSubmitted(false);
    setServerError(null);
    setCreated(null);
  }

  const back = (
    <Link to="/payments" className="back-link">
      <LuArrowLeft aria-hidden="true" />
      Betalningar
    </Link>
  );

  if (created) {
    return (
      <div className="page">
        <PageHeader title="Ny betalning" back={back} />
        <PaymentCreatedView created={created} onNew={startOver} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Ny betalning"
        description="Betala från ett av företagets konton till ett IBAN."
        back={back}
      />

      <div className="form-layout">
        <Card className="form-layout__main">
          <form id="new-payment-form" onSubmit={handleReview} noValidate>
            <CardHeader title="Betalningsuppgifter" divider />
            <CardBody className="form-stack">
              {serverError && !reviewOpen && (
                <Alert tone="danger" title="Betalningen kunde inte skapas">
                  {serverError}
                </Alert>
              )}

              {accounts.isError ? (
                <ErrorState
                  compact
                  error={accounts.error}
                  title="Kontona kunde inte hämtas"
                  onRetry={() => void accounts.refetch()}
                />
              ) : accounts.data?.length === 0 ? (
                <EmptyState compact icon={LuLandmark} title="Det finns inga konton att betala från." />
              ) : (
                <Select
                  id="payment-fromAccountId"
                  label="Från konto"
                  value={selectedAccount ? values.fromAccountId : ''}
                  onChange={(event) => setField('fromAccountId', event.target.value)}
                  onBlur={() => markTouched('fromAccountId')}
                  error={visibleError('fromAccountId')}
                  disabled={accounts.isPending}
                  hint={
                    selectedAccount ? (
                      <>
                        Tillgängligt saldo:{' '}
                        <strong>
                          <Money amount={selectedAccount.availableBalance} currency={selectedAccount.currency} />
                        </strong>
                      </>
                    ) : (
                      'Beloppet dras från det här kontot.'
                    )
                  }
                >
                  <option value="">{accounts.isPending ? 'Laddar konton…' : 'Välj konto'}</option>
                  {accounts.data?.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountName} · {formatIban(account.iban)} · {formatMoney(account.availableBalance, account.currency)}{' '}
                      tillgängligt
                    </option>
                  ))}
                </Select>
              )}

              <Input
                id="payment-iban"
                label="Mottagarens IBAN"
                value={values.iban}
                onChange={handleIbanChange}
                onBlur={() => markTouched('iban')}
                placeholder={IBAN_EXAMPLE}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                className="iban-input"
                error={showIbanError ? ibanError : undefined}
                hint={
                  ibanValid ? (
                    <span className="field__hint--success">{ibanCheck.message}</span>
                  ) : (
                    `Till exempel ${IBAN_EXAMPLE}`
                  )
                }
                suffix={
                  ibanValid ? (
                    <LuCircleCheck className="input__status input__status--valid" aria-hidden="true" />
                  ) : showIbanError ? (
                    <LuCircleAlert className="input__status input__status--invalid" aria-hidden="true" />
                  ) : undefined
                }
              />

              <Input
                id="payment-amount"
                label="Belopp"
                value={values.amount}
                onChange={(event) => setField('amount', event.target.value)}
                onBlur={handleAmountBlur}
                placeholder="0,00"
                inputMode="decimal"
                autoComplete="off"
                className="amount-input"
                suffix={<span className="input__unit">kr</span>}
                error={visibleError('amount')}
                hint="Använd komma för ören, till exempel 1 250,50."
              />

              <Input
                id="payment-reference"
                label="Referens"
                optional
                value={values.reference}
                onChange={(event) => setField('reference', event.target.value)}
                onBlur={() => markTouched('reference')}
                maxLength={MAX_REFERENCE_LENGTH}
                placeholder="Till exempel Faktura 2044"
                labelAside={`${values.reference.length}/${MAX_REFERENCE_LENGTH}`}
                error={visibleError('reference')}
                hint="Visas i betalningsöversikten och hjälper mottagaren att känna igen betalningen."
              />
            </CardBody>
            <CardFooter className="form-actions">
              <Link to="/payments" className={buttonClass({ variant: 'ghost' })}>
                Avbryt
              </Link>
              <Button type="submit" icon={LuArrowRight} iconPosition="end" disabled={accounts.isPending}>
                Granska betalning
              </Button>
            </CardFooter>
          </form>
        </Card>

        <aside className="form-layout__aside" aria-label="Sammanfattning och regler">
          <PaymentSummaryCard
            account={selectedAccount}
            iban={ibanValid ? ibanCheck.formatted : null}
            amount={amountParsed.ok ? amountParsed.value : null}
            reference={values.reference.trim()}
            outcome={outcome}
          />
          <ApprovalRulesCard
            config={config.data}
            loading={config.isPending}
            error={config.isError ? config.error : null}
            onRetry={() => void config.refetch()}
            outcome={outcome}
          />
          {exceedsAvailable && selectedAccount && (
            <Alert tone="warning" title="Beloppet överstiger tillgängligt saldo">
              {outcome === 'direct'
                ? `${selectedAccount.accountName} har ${formatMoney(selectedAccount.availableBalance, selectedAccount.currency)} tillgängligt. En direkt betalning kan inte genomföras utan täckning.`
                : `${selectedAccount.accountName} har ${formatMoney(selectedAccount.availableBalance, selectedAccount.currency)} tillgängligt. Betalningen kan avvisas om täckning saknas.`}
            </Alert>
          )}
        </aside>
      </div>

      {reviewOpen && selectedAccount && amountParsed.ok && (
        <Dialog
          open
          onClose={() => setReviewOpen(false)}
          title="Bekräfta betalning"
          description="Kontrollera uppgifterna. Betalningen skickas när du bekräftar."
          dismissible={!createPayment.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setReviewOpen(false)} disabled={createPayment.isPending}>
                Ändra
              </Button>
              <Button icon={LuSend} onClick={() => void handleConfirm()} loading={createPayment.isPending}>
                {serverError ? 'Försök igen' : 'Bekräfta och skicka'}
              </Button>
            </>
          }
        >
          {serverError && (
            <Alert tone="danger" title="Betalningen kunde inte skapas">
              {serverError}
            </Alert>
          )}
          <div className="decision-summary">
            <p className="decision-summary__label">Belopp</p>
            <p className="decision-summary__amount">
              <Money amount={amountParsed.value} currency={selectedAccount.currency} />
            </p>
            <DescriptionList
              columns={2}
              items={[
                { label: 'Från konto', value: `${selectedAccount.accountName} · ${formatIban(selectedAccount.iban)}`, wide: true },
                { label: 'Till IBAN', value: <IbanText iban={ibanCheck.normalized} />, wide: true },
                { label: 'Referens', value: values.reference.trim() || 'Ingen referens' },
                { label: 'Hantering', value: outcome ? OUTCOME_LABELS[outcome] : 'Avgörs av banken' },
              ]}
            />
          </div>
          {outcome && <OutcomeAlert outcome={outcome} accountName={selectedAccount.accountName} />}
          {exceedsAvailable && (
            <Alert tone="warning">
              Beloppet överstiger kontots tillgängliga saldo på{' '}
              {formatMoney(selectedAccount.availableBalance, selectedAccount.currency)}.
            </Alert>
          )}
        </Dialog>
      )}
    </div>
  );
}

function OutcomeAlert({ outcome, accountName }: { outcome: Outcome; accountName: string }) {
  if (outcome === 'direct') {
    return (
      <Alert tone="info" title="Genomförs direkt">
        Beloppet dras från {accountName} så fort du bekräftar.
      </Alert>
    );
  }
  return (
    <Alert tone="warning" title={outcome === 'double' ? 'Kräver dubbel attest' : 'Kräver attest'}>
      {outcome === 'double'
        ? 'Två olika attestanter behöver godkänna betalningen, en i taget. '
        : 'En attestant behöver godkänna betalningen. '}
      Beloppet reserveras på kontot tills dess, och du kan inte attestera din egen betalning.
    </Alert>
  );
}

function PaymentSummaryCard({
  account,
  iban,
  amount,
  reference,
  outcome,
}: {
  account: Account | undefined;
  iban: string | null;
  amount: string | null;
  reference: string;
  outcome: Outcome | null;
}) {
  return (
    <Card>
      <CardHeader title="Sammanfattning" divider />
      <CardBody>
        <div className="summary-amount">
          <span className="summary-amount__label">Belopp</span>
          <span className="summary-amount__value">
            {amount ? <Money amount={amount} currency={account?.currency} /> : <span className="text-subtle">0,00 kr</span>}
          </span>
          {outcome && (
            <Badge
              tone={outcome === 'direct' ? 'success' : 'warning'}
              icon={outcome === 'direct' ? LuCircleCheck : LuClock}
            >
              {OUTCOME_LABELS[outcome]}
            </Badge>
          )}
        </div>
        <dl className="summary-list">
          <div>
            <dt>Från</dt>
            <dd>{account ? account.accountName : <span className="text-subtle">Inget konto valt</span>}</dd>
          </div>
          <div>
            <dt>Till</dt>
            <dd>{iban ? <span className="iban">{iban}</span> : <span className="text-subtle">Inget giltigt IBAN</span>}</dd>
          </div>
          <div>
            <dt>Referens</dt>
            <dd className="summary-list__wrap">{reference || <span className="text-subtle">Ingen referens</span>}</dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}

function ApprovalRulesCard({
  config,
  loading,
  error,
  onRetry,
  outcome,
}: {
  config: AppConfig | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  outcome: Outcome | null;
}) {
  return (
    <Card>
      <CardHeader title="Attestregler" divider />
      <CardBody>
        {loading ? (
          <div className="rules-skeleton" aria-hidden="true">
            <Skeleton width="90%" />
            <Skeleton width="80%" />
            <Skeleton width="85%" />
          </div>
        ) : error || !config ? (
          <ErrorState compact error={error} title="Reglerna kunde inte hämtas" onRetry={onRetry} />
        ) : (
          <ul className="rules">
            <li className={cn('rule', outcome === 'direct' && 'is-active')}>
              <span className="rule__icon tone-success">
                <LuCircleCheck aria-hidden="true" />
              </span>
              <span>
                <strong>Upp till {formatMoney(config.approvalThreshold, config.currency)}</strong>
                <span>Genomförs direkt och dras från kontot.</span>
              </span>
            </li>
            <li className={cn('rule', outcome === 'single' && 'is-active')}>
              <span className="rule__icon tone-warning">
                <LuStamp aria-hidden="true" />
              </span>
              <span>
                <strong>Över {formatMoney(config.approvalThreshold, config.currency)}</strong>
                <span>Kräver attest av en attestant.</span>
              </span>
            </li>
            <li className={cn('rule', outcome === 'double' && 'is-active')}>
              <span className="rule__icon tone-info">
                <LuUsers aria-hidden="true" />
              </span>
              <span>
                <strong>Över {formatMoney(config.doubleApprovalThreshold, config.currency)}</strong>
                <span>Kräver dubbel attest av två olika attestanter.</span>
              </span>
            </li>
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function PaymentCreatedView({ created, onNew }: { created: CreatedPayment; onNew: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { payment, accountName, outcome } = created;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const content =
    payment.status === 'completed'
      ? {
          icon: LuCircleCheck,
          tone: 'success',
          title: 'Betalningen är genomförd',
          text: `Beloppet har dragits från ${accountName}.`,
        }
      : payment.status === 'pending_approval'
        ? {
            icon: LuClock,
            tone: 'warning',
            title: outcome === 'double' ? 'Betalningen väntar på dubbel attest' : 'Betalningen väntar på attest',
            text:
              outcome === 'double'
                ? 'Två olika attestanter behöver godkänna betalningen innan den genomförs. Beloppet är reserverat på kontot.'
                : 'En attestant behöver godkänna betalningen innan den genomförs. Beloppet är reserverat på kontot.',
          }
        : {
            icon: LuCircleX,
            tone: 'danger',
            title: 'Betalningen avvisades',
            text: 'Betalningen kunde inte genomföras.',
          };
  const Icon = content.icon;

  return (
    <Card className="result-card">
      <span className={`result-card__icon tone-${content.tone}`}>
        <Icon aria-hidden="true" />
      </span>
      <h2 className="result-card__title" ref={titleRef} tabIndex={-1}>
        {content.title}
      </h2>
      <p className="result-card__text">{content.text}</p>
      <DescriptionList
        className="result-card__details"
        columns={2}
        items={[
          { label: 'Belopp', value: <Money amount={payment.amount} currency={payment.currency} /> },
          { label: 'Status', value: <PaymentStatusBadge status={payment.status} /> },
          { label: 'Till IBAN', value: <IbanText iban={payment.toIban} /> },
          { label: 'Från konto', value: accountName },
          { label: 'Referens', value: payment.reference || 'Ingen referens' },
          { label: 'Betalnings-id', value: `#${payment.id}` },
        ]}
      />
      <div className="result-card__actions">
        <Link to="/payments/$paymentId" params={{ paymentId: payment.id }} className={buttonClass()}>
          Visa betalning
        </Link>
        <Button variant="secondary" icon={LuPlus} onClick={onNew}>
          Skapa ny betalning
        </Button>
      </div>
    </Card>
  );
}
