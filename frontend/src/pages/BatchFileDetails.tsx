import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LuArrowLeft, LuUpload } from "react-icons/lu";
import Card from "../components/shared/Card";
import Button from "../components/shared/Button";
import StatusBadge from "../components/shared/StatusBadge";
import BatchValidationResults from "../components/batch/BatchValidationResults";
import { useBatchWorkspace } from "../hooks/useBatchWorkspace";
import type { BatchHistoryFile } from "../types/BatchFile";

export default function BatchFileDetails() {
  const { batchId = "" } = useParams();
  const { source, previewQuery, reset } = useBatchWorkspace();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ id: string; file: BatchHistoryFile | null; error: string | null }>({ id: "", file: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    source.detail(batchId, controller.signal).then((file) => {
      if (!controller.signal.aborted) setState({ id: batchId, file, error: file ? null : "Batchfilen kunde inte hittas." });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ id: batchId, file: null,
        error: error instanceof Error ? error.message : "Kunde inte hämta batchfilen." });
    });
    return () => controller.abort();
  }, [batchId, source, retry]);
  const file = state.id === batchId ? state.file : null;
  return <section className="batch-files-page" aria-labelledby="batch-detail-title">
    <Link className="batch-files-back" to={`/batch-files${previewQuery}`}><LuArrowLeft aria-hidden="true" />Tillbaka till alla batchfiler</Link>
    <div className="batch-files-intro batch-files-detail-intro"><div><h2 id="batch-detail-title">{file?.name ?? "Batchfil – detaljer"}</h2>
      <p>Filinformation och valideringsresultat.</p></div>
      <Link className="batch-files-button" to={`/batch-upload${previewQuery}`} onClick={reset}><LuUpload aria-hidden="true" />Ladda upp en ny fil</Link></div>
    {state.id !== batchId && <div className="batch-files-state" role="status"><span className="batch-files-spinner" /><p>Laddar filinformation…</p></div>}
    {state.id === batchId && state.error && <div className="batch-files-error" role="alert"><p>{state.error}</p>
      {source.kind !== "unavailable" && <Button type="button" className="batch-files-button" onClick={() => {
        setState({ id: "", file: null, error: null }); setRetry((value) => value + 1);
      }}>Försök igen</Button>}</div>}
    {file && <><Card className="batch-files-detail-meta"><dl>
      <div><dt>Filtyp</dt><dd>{file.fileType}</dd></div><div><dt>Storlek</dt><dd>{file.size.toLocaleString("sv-SE")} byte</dd></div>
      <div><dt>Status</dt><dd><StatusBadge status={file.status === "completed" ? "success" : file.status === "failed" ? "rejected" : "processing"}>
        {file.status === "completed" ? "Completed" : file.status === "failed" ? "Failed" : "Processing"}</StatusBadge></dd></div>
      <div><dt>Skapad</dt><dd><time dateTime={file.createdAt}>{new Date(file.createdAt).toLocaleString("sv-SE")}</time></dd></div>
    </dl></Card>
      {file.validation ? <BatchValidationResults key={file.id} result={file.validation} />
        : <div className="batch-files-state" role="status"><h3>Valideringsdetaljer saknas</h3><p>Det finns inga radresultat för denna fil.</p></div>}
    </>}
  </section>;
}
