import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  LuCircleCheck,
  LuCircleX,
  LuFileText,
  LuInfo,
  LuTriangleAlert,
  LuUpload,
} from "react-icons/lu";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import StatusBadge from "../components/shared/StatusBadge";
import type { BatchValidationResult } from "../types/BatchFile";
import {
  BATCH_CSV_HEADER,
  BATCH_MAX_FILE_SIZE_BYTES,
  BATCH_MAX_ROWS,
  BATCH_MIN_ROWS,
  validateBatchCsv,
} from "../utils/batchCsv";
import "../styles/dashboard.css";
import "../styles/batchFiles.css";

const MAX_FILE_SIZE_MB = BATCH_MAX_FILE_SIZE_BYTES / (1024 * 1024);

function formatCurrency(amount: string): string {
  return `${Number(amount).toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} SEK`;
}

function formatSummaryNumber(value: number | null | undefined): number | string {
  return value ?? "—";
}

function formatSummaryAmount(amount: string | null | undefined): string {
  return amount ? formatCurrency(amount) : "—";
}

function isCsvFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".csv");
}

function BatchFiles() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [validationResult, setValidationResult] =
    useState<BatchValidationResult | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setFileError(null);
    setValidationResult(null);

    if (!file) {
      setSelectedFileName("");
      return;
    }

    setSelectedFileName(file.name);

    if (!isCsvFile(file)) {
      setFileError("Välj en CSV-fil med filändelsen .csv.");
      return;
    }

    if (file.size === 0) {
      setFileError("CSV-filen är tom.");
      return;
    }

    if (file.size > BATCH_MAX_FILE_SIZE_BYTES) {
      setFileError(`CSV-filen får vara högst ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    try {
      setIsReadingFile(true);
      const content = await file.text();

      setValidationResult(validateBatchCsv(content));
    } catch {
      setFileError("Kunde inte läsa CSV-filen. Försök med en annan fil.");
    } finally {
      setIsReadingFile(false);
    }
  }

  function clearFile() {
    setSelectedFileName("");
    setFileError(null);
    setValidationResult(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const hasValidationErrors =
    Boolean(fileError) ||
    Boolean(validationResult && !validationResult.isValid);
  const canValidateRows = validationResult?.canValidateRows ?? false;

  return (
    <div className="dashboard-layout">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((isOpen) => !isOpen)}
        onClose={() => setIsSidebarOpen(false)}
      />

      <button
        type="button"
        className={`sidebar-overlay${isSidebarOpen ? " is-open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Stäng meny"
      />

      <main className="dashboard-main">
        <DashboardHeader
          title="Batchfiler"
          subtitle="Ladda upp och granska batchbetalningar från CSV."
        />

        <div className="dashboard-content">
          <section className="batch-files-page" aria-labelledby="batch-title">
            <div className="batch-files-main">
              <Card className="batch-files-upload-card">
                <div className="batch-files-card-header">
                  <div>
                    <h2 id="batch-title">Ladda upp CSV-fil</h2>
                    <p>
                      Validera filen innan backend-integration kopplas på.
                    </p>
                  </div>
                  <LuUpload aria-hidden="true" />
                </div>

                <label className="batch-files-dropzone" htmlFor="batch-file">
                  <input
                    ref={fileInputRef}
                    id="batch-file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                  />
                  <span className="batch-files-dropzone__icon">
                    <LuFileText aria-hidden="true" />
                  </span>
                  <span className="batch-files-dropzone__title">
                    {selectedFileName || "Välj en CSV-fil"}
                  </span>
                  <span className="batch-files-dropzone__meta">
                    {BATCH_MIN_ROWS}-{BATCH_MAX_ROWS} betalningsrader, max{" "}
                    {MAX_FILE_SIZE_MB} MB
                  </span>
                </label>

                <div className="batch-files-actions">
                  <Button
                    type="button"
                    className="batch-files-secondary-action"
                    onClick={clearFile}
                    disabled={!selectedFileName && !validationResult && !fileError}
                  >
                    Rensa
                  </Button>
                  <Button
                    type="button"
                    className="batch-files-submit-action"
                    disabled
                    title="Backend API-kontrakt saknas för batchinsändning."
                  >
                    Skicka batch
                  </Button>
                </div>

                <div className="batch-files-contract-note" role="note">
                  <LuInfo aria-hidden="true" />
                  <p>
                    Batchinsändning är blockerad tills teamet har beslutat om
                    Batch API-kontrakt och backend-endpoint. Ingen fil skickas
                    till backend i denna vy.
                  </p>
                </div>
              </Card>

              <Card className="batch-files-rules-card">
                <div className="batch-files-card-header">
                  <div>
                    <h2>CSV-format</h2>
                    <p>Filen måste följa projektets befintliga batchformat.</p>
                  </div>
                </div>

                <pre className="batch-files-format-example">
{`${BATCH_CSV_HEADER.join(",")}
1,SE8550000000054910000003,5000.00,Faktura #2001
1,SE8550000000054910000005,12500.00,"Malmö Bygg, faktura 99"`}
                </pre>

                <ul className="batch-files-rules-list">
                  <li>Headern måste vara exakt: {BATCH_CSV_HEADER.join(",")}</li>
                  <li>Referenser med kommatecken ska vara citerade.</li>
                  <li>Konto-id måste vara ett positivt heltal.</li>
                  <li>IBAN är obligatoriskt och får vara högst 34 tecken.</li>
                  <li>Belopp måste vara större än 0 och använda punkt som decimaltecken.</li>
                  <li>Referens får vara högst 100 tecken.</li>
                </ul>
              </Card>
            </div>

            <div className="batch-files-results">
              <Card className="batch-files-status-card">
                <div className="batch-files-card-header">
                  <div>
                    <h2>Valideringsstatus</h2>
                    <p>Resultat för den valda filen.</p>
                  </div>
                </div>

                {isReadingFile ? (
                  <div className="batch-files-state" aria-live="polite">
                    <LuUpload aria-hidden="true" />
                    <strong>Validerar fil...</strong>
                    <span>Filen läses lokalt i webbläsaren.</span>
                  </div>
                ) : !selectedFileName && !validationResult && !fileError ? (
                  <div className="batch-files-state">
                    <LuFileText aria-hidden="true" />
                    <strong>Ingen fil vald</strong>
                    <span>Välj en CSV-fil för att se valideringsresultatet.</span>
                  </div>
                ) : hasValidationErrors ? (
                  <div className="batch-files-state batch-files-state--error">
                    <LuCircleX aria-hidden="true" />
                    <strong>Filen behöver korrigeras</strong>
                    <span>Åtgärda felen nedan och välj filen igen.</span>
                  </div>
                ) : (
                  <div className="batch-files-state batch-files-state--success">
                    <LuCircleCheck aria-hidden="true" />
                    <strong>Filen är validerad</strong>
                    <span>
                      Batchen är redo för granskning men skickas inte till backend ännu.
                    </span>
                  </div>
                )}

                {fileError ? (
                  <p className="batch-files-alert batch-files-alert--error" role="alert">
                    <LuTriangleAlert aria-hidden="true" />
                    {fileError}
                  </p>
                ) : null}

                {validationResult?.fileErrors.length ? (
                  <div className="batch-files-error-list" role="alert">
                    <strong>Filfel</strong>
                    <ul>
                      {validationResult.fileErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {validationResult && !validationResult.canValidateRows ? (
                  <div className="batch-files-error-list" role="status">
                    <strong>Radgranskning pausad</strong>
                    <ul>
                      <li>Raderna valideras först när filstrukturen är korrekt.</li>
                    </ul>
                  </div>
                ) : null}
              </Card>

              <div className="batch-files-summary-grid">
                <Card className="batch-files-summary-card">
                  <span>Totalt antal rader</span>
                  <strong>{formatSummaryNumber(validationResult?.summary.totalRows)}</strong>
                </Card>
                <Card className="batch-files-summary-card">
                  <span>Godkända rader</span>
                  <strong>{formatSummaryNumber(validationResult?.summary.validRows)}</strong>
                </Card>
                <Card className="batch-files-summary-card">
                  <span>Felaktiga rader</span>
                  <strong>{formatSummaryNumber(validationResult?.summary.invalidRows)}</strong>
                </Card>
                <Card className="batch-files-summary-card">
                  <span>Godkänt belopp</span>
                  <strong>{formatSummaryAmount(validationResult?.summary.totalAmount)}</strong>
                </Card>
              </div>

              {canValidateRows && validationResult?.rows.length ? (
                <Card className="batch-files-table-card">
                  <div className="batch-files-card-header">
                    <div>
                      <h2>Radgranskning</h2>
                      <p>Alla betalningsrader från filen.</p>
                    </div>
                  </div>

                  <div className="batch-files-table-wrap">
                    <table className="batch-files-table">
                      <thead>
                        <tr>
                          <th>Rad</th>
                          <th>Konto</th>
                          <th>IBAN</th>
                          <th>Belopp</th>
                          <th>Referens</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationResult.rows.map((row) => (
                          <tr key={row.rowNumber}>
                            <td>{row.rowNumber}</td>
                            <td>{row.fromAccountId || "-"}</td>
                            <td>{row.normalizedToIban || "-"}</td>
                            <td>{row.amount || "-"}</td>
                            <td>{row.reference || "-"}</td>
                            <td>
                              {row.status === "valid" ? (
                                <StatusBadge status="success">OK</StatusBadge>
                              ) : (
                                <div className="batch-files-row-errors">
                                  <StatusBadge status="failed">Fel</StatusBadge>
                                  <ul>
                                    {row.errors.map((error) => (
                                      <li key={error}>{error}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default BatchFiles;
