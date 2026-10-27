import { useRef, useState } from 'react';
import { LuCheck, LuX } from 'react-icons/lu';
import { useDecideApproval } from '../../api/approvals';
import { ApiError, getErrorMessage } from '../../api/client';
import type { ApprovalAction, ApprovalDecisionResponse, Money as MoneyValue } from '../../api/types';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { DescriptionList, type DescriptionItem } from '../ui/DescriptionList';
import { Dialog } from '../ui/Dialog';
import { Textarea } from '../ui/Field';
import { IbanText } from '../ui/IbanText';
import { Money } from '../ui/Money';
import { useToast } from '../ui/toast/ToastContext';

const MAX_COMMENT_LENGTH = 255;

/** The payment and step an attestant is about to decide. */
export interface DecisionTarget {
  approvalStepId: number;
  paymentId: number;
  action: ApprovalAction;
  amount: MoneyValue;
  currency: string;
  reference: string;
  toIban: string;
  fromAccountName?: string;
  createdByName?: string;
  stepNumber?: number;
  totalSteps?: number;
}

interface DecisionDialogProps {
  target: DecisionTarget;
  onClose: () => void;
  onDecided?: (result: ApprovalDecisionResponse) => void;
}

function successMessage(result: ApprovalDecisionResponse, target: DecisionTarget) {
  if (target.action === 'reject') return 'Betalningen har avvisats.';
  if (result.paymentStatus === 'completed') return 'Betalningen är godkänd och har genomförts.';
  const step = target.stepNumber ? `Steg ${target.stepNumber}` : 'Attesten';
  return `${step} är godkänt. Betalningen väntar nu på nästa attest.`;
}

/** Confirm dialog for approving or rejecting an approval step. A rejection needs a comment. */
export function DecisionDialog({ target, onClose, onDecided }: DecisionDialogProps) {
  const decide = useDecideApproval();
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const rejecting = target.action === 'reject';
  const finalStep =
    target.stepNumber !== undefined && target.totalSteps !== undefined && target.stepNumber >= target.totalSteps;

  async function handleConfirm() {
    const trimmed = comment.trim();
    if (rejecting && !trimmed) {
      setCommentError('Skriv en kommentar som förklarar varför betalningen avvisas.');
      commentRef.current?.focus();
      return;
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setCommentError(`Kommentaren får vara högst ${MAX_COMMENT_LENGTH} tecken.`);
      commentRef.current?.focus();
      return;
    }

    setError(null);
    try {
      const result = await decide.mutateAsync({
        approvalStepId: target.approvalStepId,
        body: { action: target.action, comment: trimmed || undefined },
      });
      toast.success(successMessage(result, target));
      onDecided?.(result);
      onClose();
    } catch (caught) {
      // Somebody else decided first, or the step is no longer ours: close and let the
      // refetched data show the current state.
      if (caught instanceof ApiError && [403, 404, 409].includes(caught.status)) {
        toast.error(caught.detail, {
          title: caught.status === 409 ? 'Betalningen har redan hanterats' : 'Beslutet kunde inte sparas',
        });
        onClose();
        return;
      }
      setError(getErrorMessage(caught));
    }
  }

  const details: DescriptionItem[] = [
    { label: 'Referens', value: target.reference || 'Utan referens' },
    { label: 'Mottagare', value: <IbanText iban={target.toIban} /> },
  ];
  if (target.fromAccountName) details.push({ label: 'Från konto', value: target.fromAccountName });
  if (target.createdByName) details.push({ label: 'Skapad av', value: target.createdByName });
  if (target.stepNumber && target.totalSteps) {
    details.push({ label: 'Attest', value: `Steg ${target.stepNumber} av ${target.totalSteps}` });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={rejecting ? 'Avvisa betalning' : 'Godkänn betalning'}
      description={
        rejecting
          ? 'Betalningen stoppas och det reserverade beloppet frigörs på kontot.'
          : 'Kontrollera uppgifterna innan du godkänner.'
      }
      dismissible={!decide.isPending}
      initialFocusRef={rejecting ? commentRef : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={decide.isPending}>
            Avbryt
          </Button>
          <Button
            variant={rejecting ? 'danger' : 'primary'}
            icon={rejecting ? LuX : LuCheck}
            onClick={() => void handleConfirm()}
            loading={decide.isPending}
          >
            {rejecting ? 'Avvisa betalningen' : 'Godkänn betalningen'}
          </Button>
        </>
      }
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="decision-summary">
        <p className="decision-summary__label">Belopp</p>
        <p className="decision-summary__amount">
          <Money amount={target.amount} currency={target.currency} />
        </p>
        <DescriptionList items={details} columns={2} />
      </div>

      {!rejecting && finalStep && (
        <Alert tone="info">
          Det här är den sista attesten. När du godkänner genomförs betalningen och beloppet dras från kontot.
        </Alert>
      )}

      <Textarea
        ref={commentRef}
        label="Kommentar"
        optional={!rejecting}
        rows={3}
        maxLength={MAX_COMMENT_LENGTH}
        value={comment}
        onChange={(event) => {
          setComment(event.target.value);
          if (commentError) setCommentError(undefined);
        }}
        error={commentError}
        labelAside={`${comment.length}/${MAX_COMMENT_LENGTH}`}
        hint="Kommentaren sparas i attestflödet och syns för alla som kan se betalningen."
        placeholder={rejecting ? 'Till exempel: Fakturan är redan betald.' : undefined}
      />
    </Dialog>
  );
}
