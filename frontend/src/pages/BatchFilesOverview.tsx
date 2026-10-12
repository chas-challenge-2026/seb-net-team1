import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LuDownload, LuFileText, LuRefreshCw, LuSearch, LuUpload } from "react-icons/lu";
import Card from "../components/shared/Card";
import Button from "../components/shared/Button";
import StatusBadge from "../components/shared/StatusBadge";
import BatchPagination from "../components/batch/BatchPagination";
import { useBatchWorkspace } from "../hooks/useBatchWorkspace";
import { useBatchHistory } from "../hooks/useBatchHistory";
import { DEFAULT_BATCH_QUERY } from "../utils/batchHistory";
import { BATCH_HISTORY_PAGE_SIZE, getBatchPageSlots, getBatchPagination } from "../utils/batchPagination";
import type { BatchHistoryFile, BatchHistoryQuery, BatchSort, BatchStatus } from "../types/BatchFile";

const tabs: { value: BatchStatus | "all"; label: string }[] = [
  { value: "all", label: "All files" }, { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" }, { value: "failed", label: "Failed" },
];

export default function BatchFilesOverview() {
  const { source, previewQuery, query, setQuery } = useBatchWorkspace();
  const queryKey = JSON.stringify(query);
  const [pageState, setPageState] = useState({ key: queryKey, page: 1 });
  const page = pageState.key === queryKey ? pageState.page : 1;
  const setPage = (value: number) => setPageState({ key: queryKey, page: value });
  const history = useBatchHistory(source, query);
  const data = history.data;
  const local = useMemo(() => getBatchPagination(data?.items.length ?? 0, page, BATCH_HISTORY_PAGE_SIZE), [data, page]);
  const isCursor = source.pagination === "cursor";
  const currentPage = isCursor ? history.navigation.index + 1 : local.page;
  const items = isCursor ? data?.items ?? [] : data?.items.slice(local.start, local.end) ?? [];
  const start = isCursor ? data?.start ?? 0 : local.start;
  const slots = isCursor ? getBatchPageSlots(history.navigation.cursors.length, currentPage) : local.slots;
  function updateQuery(patch: Partial<BatchHistoryQuery>) { setQuery((previous) => ({ ...previous, ...patch })); setPage(1); }
  function download(file: BatchHistoryFile) {
    if (source.kind !== "development" || file.csvContent === null) return;
    const url = URL.createObjectURL(new Blob([file.csvContent], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = file.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="batch-files-page batch-files-overview" aria-label="Batchfiler">
    <div className="batch-files-tabs" role="group" aria-label="Filstatus">
      {tabs.map((tab) => <Button type="button" key={tab.value} aria-pressed={query.status === tab.value}
        className={`batch-files-tab${query.status === tab.value ? " is-active" : ""}`} onClick={() => updateQuery({ status: tab.value })}>
        {tab.label}{tab.value !== "all" && history.metadata?.counts && ` (${history.metadata.counts[tab.value]})`}</Button>)}
    </div>
    <div className="batch-files-toolbar">
      <label className="batch-files-search"><LuSearch aria-hidden="true" /><span className="batch-files-sr-only">Sök batchfil</span>
        <input type="search" placeholder="Sök batchfil…" value={query.search} onChange={(event) => updateQuery({ search: event.target.value })} /></label>
      <label className="batch-files-select"><span className="batch-files-sr-only">Filtyp</span><select value={query.fileType}
        onChange={(event) => updateQuery({ fileType: event.target.value })}><option value="all">Filtyp: Alla</option>
        {(history.metadata?.fileTypes ?? (query.fileType === "all" ? [] : [query.fileType])).map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      <label className="batch-files-select"><span className="batch-files-sr-only">Sortera batchfiler</span><select value={query.sort}
        onChange={(event) => updateQuery({ sort: event.target.value as BatchSort })}>
        <option value="created-desc">Sortera efter: Skapad datum</option><option value="created-asc">Skapad datum: Äldst först</option>
        <option value="name">Filnamn: A–Ö</option><option value="size">Storlek: Störst först</option></select></label>
      <Link className="batch-files-button" to={`/batch-upload${previewQuery}`}><LuUpload aria-hidden="true" />Ladda upp batchfil</Link>
      {(query.search || query.status !== "all" || query.fileType !== "all" || query.sort !== "created-desc") &&
        <Button type="button" className="batch-files-clear" onClick={() => { setQuery(DEFAULT_BATCH_QUERY); setPage(1); }}><LuRefreshCw aria-hidden="true" />Rensa filter</Button>}
    </div>
    <Card className="batch-files-history">
      <div className="batch-files-history-body">
      <div className="batch-files-table-scroll" role="region" tabIndex={0} aria-label="Batchfilhistorik" aria-busy={history.loading}>
        <table className="batch-files-table batch-files-history-table"><caption className="batch-files-sr-only">Batchfilhistorik{source.kind === "development" ? ", utvecklingsdata" : ""}</caption>
          <thead><tr>{["File name", "Type", "Size", "Status", "Created", "Actions"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{items.map((file) => <tr key={file.id}>
            <td><Link className="batch-files-file-link" to={`/batch-files/${encodeURIComponent(file.id)}${previewQuery}`}>{file.name}</Link></td>
            <td>{file.fileType}</td><td className="batch-files-nowrap">{(file.size / 1024).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kB</td>
            <td><StatusBadge status={file.status === "completed" ? "success" : file.status === "failed" ? "rejected" : "processing"}>
              {tabs.find((tab) => tab.value === file.status)?.label}</StatusBadge></td>
            <td className="batch-files-nowrap"><time dateTime={file.createdAt}>{new Date(file.createdAt).toLocaleString("sv-SE", {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
            })}</time></td>
            <td><Button type="button" className="batch-files-icon-button" onClick={() => download(file)} disabled={file.csvContent === null}
              aria-label={`Ladda ner utvecklingsexempel ${file.name}`} title="Ladda ner CSV (utvecklingsdata)"><LuDownload aria-hidden="true" /></Button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {history.loading && <div className="batch-files-state" role="status"><span className="batch-files-spinner" /><p>Laddar batchfiler…</p></div>}
      {!history.loading && !data && <div className="batch-files-state" role={history.unavailable ? "status" : "alert"}>
        <LuFileText aria-hidden="true" /><h3>{history.unavailable ? "Filhistorik är inte ansluten" : "Kunde inte hämta batchfiler"}</h3>
        <p>{history.error}</p>{!history.unavailable && <Button type="button" className="batch-files-button" onClick={history.reload}>Försök igen</Button>}
        {import.meta.env.DEV && history.unavailable && <Link className="batch-files-back" to="/batch-files?preview=fixtures">Visa tydligt märkta utvecklingsexempel</Link>}
      </div>}
      {!history.loading && data && items.length === 0 && <div className="batch-files-state" role="status"><LuFileText aria-hidden="true" />
        <h3>Inga batchfiler hittades</h3><p>Prova att ändra sökningen eller filtren, eller ladda upp en ny CSV-fil.</p></div>}
      {data && history.error && <div className="batch-files-error" role="alert"><p>{history.error} Den tidigare sidan visas fortfarande.</p>
        <Button type="button" className="batch-files-button--secondary batch-files-button" onClick={() => {
          if (history.failedPage !== null) void history.goToCursor(history.failedPage); else history.reload();
        }}>Försök igen</Button></div>}
      </div>
      <footer className="batch-files-footer"><p aria-live="polite">{!data ? "Filhistorik saknas" : items.length === 0 ? "Visar 0 batchfiler"
        : `Visar ${start + 1}–${start + items.length}${data.total === null ? "" : ` av ${data.total}`} batchfiler`}</p>
        <BatchPagination page={currentPage} slots={slots} busy={history.loading}
          previousDisabled={!data || currentPage <= 1}
          nextDisabled={!data || (isCursor ? data.nextCursor === null : local.page >= local.totalPages)}
          onPage={(value) => { if (isCursor) void history.goToCursor(value - 1); else setPage(value); }} /></footer>
    </Card>
  </section>;
}
