import { useMemo, useRef, useState } from "react";
import { LuChevronDown, LuChevronUp, LuCircleCheck, LuCircleAlert, LuSearch } from "react-icons/lu";
import Card from "../shared/Card";
import Button from "../shared/Button";
import StatusBadge from "../shared/StatusBadge";
import BatchPagination from "./BatchPagination";
import type { BatchValidationResult } from "../../types/BatchFile";
import { filterBatchRows } from "../../utils/batchHistory";
import { BATCH_REVIEW_PAGE_SIZE, getBatchPagination } from "../../utils/batchPagination";

export default function BatchValidationResults({ result }: { result: BatchValidationResult }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const filtered = useMemo(() => filterBatchRows(result.rows, filter, search), [result.rows, filter, search]);
  const pagination = getBatchPagination(filtered.length, page, BATCH_REVIEW_PAGE_SIZE);
  const rows = filtered.slice(pagination.start, pagination.end);
  const summary = result.summary;
  const amount = summary.totalAmount === null ? "—" : `${Number(summary.totalAmount).toLocaleString("sv-SE", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} SEK`;

  function selectFilter(value: string, focus = false) {
    setFilter(value); setPage(1); setExpanded(null);
    if (focus) { reviewHeading.current?.focus(); reviewHeading.current?.scrollIntoView({ block: "nearest" }); }
  }
  return <section className="batch-files-results" aria-label="Valideringsresultat">
    <div className="batch-files-validation-feedback">
    <div className={`batch-files-validation-state ${result.isValid ? "is-valid" : "is-invalid"}`} role="status">
      {result.isValid ? <LuCircleCheck aria-hidden="true" /> : <LuCircleAlert aria-hidden="true" />}
      <div><h2>{result.isValid ? "Filen är validerad" : "Filen behöver korrigeras"}</h2>
        <p>{result.isValid ? "Alla betalningsrader har klarat den lokala valideringen. Ingen betalning har skickats."
          : "Kontrollera felen nedan och välj en korrigerad CSV-fil."}</p></div>
    </div>
    {result.fileErrors.length > 0 && <div className="batch-files-error" role="alert">
      <h3>Fel i filen</h3><ul>{result.fileErrors.map((error) => <li key={error}>{error}</li>)}</ul>
    </div>}
    </div>
    <div className="batch-files-summary">
      {[
        { label: "Totalt antal rader", value: summary.totalRows ?? "—", filter: "all" },
        { label: "Godkända rader", value: summary.validRows ?? "—", filter: "valid" },
        { label: "Felaktiga rader", value: summary.invalidRows ?? "—", filter: "invalid" },
      ].map((item) => <Button type="button" key={item.label} className="batch-files-summary-item"
        disabled={!result.canValidateRows} onClick={() => selectFilter(item.filter, true)}
        aria-label={`${item.label}: ${item.value}. Visa dessa rader.`}>
        <span>{item.label}</span><strong>{item.value}</strong>
      </Button>)}
      <div className="batch-files-summary-item"><span>Godkänt belopp</span><strong>{amount}</strong></div>
    </div>
    {!result.canValidateRows ? <div className="batch-files-notice" role="note">
      <strong>Radgranskning pausad</strong><p>Filstrukturen måste korrigeras innan betalningsrader och belopp kan godkännas.</p>
    </div> : <Card className="batch-files-review">
      <div className="batch-files-review-header">
      <div className="batch-files-section-heading"><div><h2 ref={reviewHeading} tabIndex={-1}>Granska betalningsrader</h2>
        <p>Radnumret avser radens början i CSV-filen.</p></div>
        <span className="batch-files-muted">{summary.invalidRows} av {summary.totalRows} rader har fel</span></div>
      <div className="batch-files-review-controls">
        <label className="batch-files-search"><LuSearch aria-hidden="true" /><span className="batch-files-sr-only">Sök betalningsrader</span>
          <input type="search" placeholder="Sök rad, konto, IBAN eller fel…" value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); setExpanded(null); }} /></label>
        <label className="batch-files-select"><span>Visa rader</span><select value={filter} onChange={(event) => selectFilter(event.target.value)}>
          <option value="all">Alla ({summary.totalRows})</option><option value="invalid">Felaktiga ({summary.invalidRows})</option>
          <option value="valid">Godkända ({summary.validRows})</option></select></label>
      </div>
      </div>
      <div className="batch-files-table-scroll" role="region" aria-label="Betalningsrader och valideringsfel" tabIndex={0}>
        <table className="batch-files-table batch-files-row-table"><caption className="batch-files-sr-only">Lokalt validerade CSV-rader</caption>
          <thead><tr>{["Rad", "Konto", "IBAN", "Belopp", "Referens", "Status"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{rows.flatMap((row) => [
            <tr key={row.recordNumber} className={row.status === "invalid" ? "batch-files-invalid-row" : ""}>
              <td>{row.rowNumber}</td><td>{row.fromAccountId || "—"}</td><td>{row.toIban || "—"}</td>
              <td className="batch-files-numeric">{row.amount || "—"}</td><td>{row.reference || "—"}</td>
              <td>{row.status === "valid" ? <StatusBadge status="success">OK</StatusBadge>
                : <Button type="button" className="batch-files-error-toggle" aria-expanded={expanded === row.recordNumber}
                  aria-controls={`batch-row-errors-${row.recordNumber}`} onClick={() => setExpanded(expanded === row.recordNumber ? null : row.recordNumber)}>
                  {row.errors.length} fel
                  {expanded === row.recordNumber ? <LuChevronUp aria-hidden="true" /> : <LuChevronDown aria-hidden="true" />}
                  <span className="batch-files-sr-only"> på rad {row.rowNumber}</span>
                </Button>}</td>
            </tr>,
            ...(expanded === row.recordNumber ? [<tr key={`errors-${row.recordNumber}`} id={`batch-row-errors-${row.recordNumber}`} className="batch-files-error-detail">
              <td colSpan={6}><strong>Rad {row.rowNumber} · betalning {row.recordNumber}</strong>
                <ul>{row.errors.map((error) => <li key={error}>{error}</li>)}</ul>
                <p>IBAN efter normalisering: {row.normalizedToIban || "—"}. Lokal formatkontroll, inte verifiering av mottagarkonto.</p></td>
            </tr>] : []),
          ])}</tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="batch-files-empty-inline" role="status">Inga rader matchar sökningen eller filtret.</p>}
      <footer className="batch-files-footer"><p aria-live="polite">{filtered.length === 0 ? "Visar 0 rader"
        : `Visar ${pagination.start + 1}–${pagination.end} av ${filtered.length} rader`}</p>
        <BatchPagination page={pagination.page} slots={pagination.slots} previousDisabled={pagination.page <= 1}
          nextDisabled={pagination.page === 0 || pagination.page >= pagination.totalPages} label="Sidor för betalningsrader"
          onPage={(value) => { setPage(value); setExpanded(null); }} /></footer>
    </Card>}
  </section>;
}
