import { LuCheck } from 'react-icons/lu';
import type { ApprovalProgress } from '../../api/types';

/** "1/2" attests, or a dash when the payment never needed attest. */
export function ApprovalProgressText({ progress }: { progress: ApprovalProgress | null }) {
  if (!progress) {
    return (
      <span className="approval-progress approval-progress--none">
        <span aria-hidden="true">–</span>
        <span className="visually-hidden">Ingen attest krävs</span>
      </span>
    );
  }
  const done = progress.approved >= progress.required;
  return (
    <span className={done ? 'approval-progress approval-progress--done' : 'approval-progress'}>
      {done && <LuCheck aria-hidden="true" />}
      <span aria-hidden="true">
        {progress.approved}/{progress.required}
      </span>
      <span className="visually-hidden">
        {progress.approved} av {progress.required} attester klara
      </span>
    </span>
  );
}
