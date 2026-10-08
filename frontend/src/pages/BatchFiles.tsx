import { useRef } from "react";
import { Link } from "react-router-dom";
import { LuArrowLeft, LuFileUp, LuInfo, LuUpload, LuX } from "react-icons/lu";
import Card from "../components/shared/Card";
import Button from "../components/shared/Button";
import BatchValidationResults from "../components/batch/BatchValidationResults";
import { useBatchWorkspace } from "../hooks/useBatchWorkspace";
import { BATCH_CSV_HEADER, BATCH_MIN_ROWS, BATCH_MAX_ROWS } from "../utils/batchCsv";

export default function BatchFiles() {
  const { upload, selectFile, reset, previewQuery } = useBatchWorkspace();
  const input = useRef<HTMLInputElement>(null);
  function chooseAnother() { input.current?.click(); }
  return <section className="batch-files-page batch-files-upload-page" aria-labelledby="batch-upload-title">
    <Link className="batch-files-back" to={`/batch-files${previewQuery}`}><LuArrowLeft aria-hidden="true" />Tillbaka till alla batchfiler</Link>
    <div className="batch-files-intro"><h2 id="batch-upload-title">Ladda upp batchfil</h2>
      <p>Välj en CSV-fil, granska betalningsraderna och korrigera eventuella fel.</p></div>
    <div className="batch-files-upload-grid">
      <Card className="batch-files-upload-card">
        <div className="batch-files-section-heading"><h2>Välj CSV-fil</h2><LuUpload aria-hidden="true" /></div>
        <label className="batch-files-dropzone" htmlFor="batch-file">
          <input ref={input} id="batch-file" type="file" accept=".csv,text/csv"
            onClick={(event) => { event.currentTarget.value = ""; }}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void selectFile(file); }} />
          <LuFileUp className="batch-files-upload-icon" aria-hidden="true" />
          <strong>{upload.name || "Välj en CSV-fil"}</strong>
          <span>{BATCH_MIN_ROWS}–{BATCH_MAX_ROWS} betalningsrader, max 1 MB</span>
          {upload.name && <small>{new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(upload.size / 1024)} kB · Välj igen för att ersätta filen</small>}
        </label>
        <div className="batch-files-actions">
          <Button type="button" className="batch-files-button batch-files-button--secondary" disabled={upload.phase === "empty"}
            onClick={() => { reset(); if (input.current) { input.current.value = ""; input.current.focus(); } }}><LuX aria-hidden="true" />Rensa</Button>
          <Button type="button" className="batch-files-button" onClick={chooseAnother}><LuUpload aria-hidden="true" />
            {upload.phase === "empty" ? "Välj fil" : "Ladda upp en ny fil"}</Button>
          <Button type="button" className="batch-files-button batch-files-submit" disabled
            title="Batchinsändning kräver ett överenskommet API och kontrakt.">Skicka batch</Button>
        </div>
        <div className="batch-files-notice" role="note"><LuInfo aria-hidden="true" />
          <p>Filen valideras lokalt. Batch-API är inte anslutet, så inga filer eller betalningar skickas till backend.</p></div>
      </Card>
      <aside className="batch-files-format" aria-labelledby="batch-format-title"><h2 id="batch-format-title">CSV-format</h2>
        <p>Fyra kolumner i denna ordning:</p><pre tabIndex={0}>{BATCH_CSV_HEADER.join(",")}</pre>
        <ul><li>Konto-id: positivt heltal, högst 999999999.</li><li>IBAN: obligatoriskt, högst 34 bokstäver/siffror. Mellanslag tas bort.</li>
          <li>Belopp: större än 0, punkt som decimaltecken.</li><li>Referens: högst 100 tecken. Citera fält som innehåller kommatecken.</li></ul>
        <p className="batch-files-muted">Kontrollen verifierar inte kontots ägare, saldo eller IBAN-kontrollsumma.</p></aside>
    </div>
    {upload.phase === "empty" && <div className="batch-files-state" role="status"><LuFileUp aria-hidden="true" />
      <h2>Ingen fil vald</h2><p>Välj en CSV-fil för att se valideringsresultatet.</p></div>}
    {upload.phase === "reading" && <div className="batch-files-state" role="status" aria-busy="true"><span className="batch-files-spinner" />
      <h2>Validerar fil…</h2><p>Filen läses lokalt i webbläsaren.</p></div>}
    {upload.error && <div className="batch-files-error" role="alert"><h2>Filen kunde inte valideras</h2><p>{upload.error}</p></div>}
    {upload.result && <BatchValidationResults key={upload.revision} result={upload.result} />}
  </section>;
}
