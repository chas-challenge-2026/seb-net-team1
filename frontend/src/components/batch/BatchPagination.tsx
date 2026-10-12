import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import Button from "../shared/Button";
import type { BatchPageSlot } from "../../utils/batchPagination";

type Props = {
  page: number; slots: BatchPageSlot[]; previousDisabled: boolean; nextDisabled: boolean;
  busy?: boolean; onPage: (page: number) => void; label?: string;
};

export default function BatchPagination({ page, slots, previousDisabled, nextDisabled, busy = false,
  onPage, label = "Sidor för batchfiler" }: Props) {
  return <nav className="batch-files-pagination" aria-label={label}>
    <Button type="button" className="batch-files-page-button" disabled={busy || previousDisabled}
      onClick={() => onPage(page - 1)} aria-label="Föregående sida" title="Föregående sida"><LuChevronLeft aria-hidden="true" /></Button>
    {slots.map((slot) => typeof slot === "number"
      ? <Button type="button" key={slot} className={`batch-files-page-button${slot === page ? " is-current" : ""}`}
        aria-label={`Sida ${slot}`} aria-current={slot === page ? "page" : undefined}
        disabled={busy || slot === page} onClick={() => onPage(slot)}>{slot}</Button>
      : <span className="batch-files-page-ellipsis" key={slot} aria-hidden="true">…</span>)}
    <Button type="button" className="batch-files-page-button" disabled={busy || nextDisabled}
      onClick={() => onPage(page + 1)} aria-label="Nästa sida" title="Nästa sida"><LuChevronRight aria-hidden="true" /></Button>
  </nav>;
}
