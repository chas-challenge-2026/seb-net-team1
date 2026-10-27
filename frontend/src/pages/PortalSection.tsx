import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/dashboard/Sidebar";
import Card from "../components/shared/Card";
import { getMockRows } from "../api/mockApi";
import "../styles/portalSection.css";

type Section = "payments" | "approvals" | "batches" | "reports" | "audit" | "settings";
type Row = { id: string | number; [key: string]: string | number | boolean | null };
type Data = Record<string, Row[]>;
const sections: Record<Section, { title: string; description: string; resources: string[] }> = {
  payments: { title: "Betalningar", description: "Företagets betalningar och deras status.", resources: ["payments", "accounts"] },
  approvals: { title: "Godkännanden", description: "Atteststeg och betalningar som väntar på godkännande.", resources: ["approvalSteps", "payments", "users"] },
  batches: { title: "Batchfiler", description: "Uppladdade betalningsfiler och resultat från valideringen.", resources: ["batchUploads", "users"] },
  reports: { title: "Rapporter", description: "Sammanställning av företagets betalningar per valuta och status.", resources: ["payments"] },
  audit: { title: "Audit-logg", description: "Registrerade händelser och deras signaturer.", resources: ["auditEntries", "users"] },
  settings: { title: "Inställningar", description: "Företagsuppgifter, användare och attestregler.", resources: ["tenants", "users", "approvalFlows"] },
};
const labels: Record<string, string> = { completed: "Genomförd", pending_approval: "Väntar på godkännande", pending: "Väntar på beslut", waiting: "Väntar på föregående steg", validated: "Validerad", approved: "Godkänd", rejected: "Avvisad", failed: "Misslyckad" };
const status = (value: Row[string]) => labels[String(value)] ?? String(value ?? "—");
const date = (value: Row[string]) => value ? new Date(String(value)).toLocaleString("sv-SE") : "—";
const money = (value: Row[string], currency: Row[string]) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: String(currency ?? "SEK") }).format(Number(value ?? 0));
const related = (rows: Row[] = [], id: Row[string], field: string) => rows.find(row => String(row.id) === String(id))?.[field] ?? "—";

function DataTable({ title, headers, rows }: { title: string; headers: string[]; rows: ReactNode[][] }) {
  return <Card className="portal-card"><h2>{title}</h2>{rows.length === 0 ? <p>Det finns inga poster att visa.</p> : <div className="portal-table-scroll"><table><caption className="portal-sr-only">{title}</caption><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>}</Card>;
}

export default function PortalSection({ section }: { section: Section }) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<Data>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const config = sections[section];
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(config.resources.map(async resource => [resource, await getMockRows<Row>(resource, controller.signal)] as const))
      .then(entries => { if (!controller.signal.aborted) setData(Object.fromEntries(entries)); })
      .catch(() => { if (!controller.signal.aborted) setError("Kunde inte hämta uppgifterna. Kontrollera att mockservern körs och försök igen."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [config, retry]);

  function content() {
    const payments = data.payments ?? [];
    if (section === "payments") return <><Link className="portal-action" to="/new-payment">Ny betalning</Link><DataTable title="Alla betalningar" headers={["Referens", "Från konto", "Mottagarens IBAN", "Belopp", "Status", "Skapad"]} rows={payments.map(p => [p.reference, related(data.accounts, p.fromAccountId, "accountName"), p.toIban, money(p.amount, p.currency), status(p.status), date(p.createdAt)])} /></>;
    if (section === "approvals") return <DataTable title="Atteststeg" headers={["Betalning", "Belopp", "Attestant", "Steg", "Status", "Beslut"]} rows={(data.approvalSteps ?? []).map(step => { const payment = payments.find(p => String(p.id) === String(step.paymentId)); return [payment?.reference ?? `Betalning ${step.paymentId}`, payment ? money(payment.amount, payment.currency) : "—", related(data.users, step.attestantId, "name"), step.stepNumber, status(step.status), date(step.decidedAt)]; })} />;
    if (section === "batches") return <DataTable title="Uppladdade filer" headers={["Filnamn", "Uppladdad av", "Antal rader", "Giltiga", "Ogiltiga", "Status", "Datum"]} rows={(data.batchUploads ?? []).map(batch => [batch.fileName, related(data.users, batch.uploadedBy, "name"), batch.rowCount, batch.validRows, batch.invalidRows, status(batch.status), date(batch.createdAt)])} />;
    if (section === "audit") return <DataTable title="Händelser" headers={["Datum", "Användare", "Åtgärd", "Beskrivning", "Objekt", "Signatur"]} rows={[...(data.auditEntries ?? [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(entry => [date(entry.createdAt), related(data.users, entry.userId, "name"), entry.action, entry.description, `${entry.entityType} #${entry.entityId}`, entry.signature])} />;
    if (section === "reports") {
      const groups = new Map<string, { currency: string; status: string; count: number; amount: number }>();
      payments.forEach(payment => { const key = `${payment.currency}:${payment.status}`; const group = groups.get(key) ?? { currency: String(payment.currency), status: String(payment.status), count: 0, amount: 0 }; group.count++; group.amount += Number(payment.amount); groups.set(key, group); });
      return <DataTable title="Betalningsrapport" headers={["Valuta", "Status", "Antal betalningar", "Totalt belopp"]} rows={[...groups.values()].map(group => [group.currency, status(group.status), group.count, money(group.amount, group.currency)])} />;
    }
    return <><DataTable title="Företag" headers={["Namn"]} rows={(data.tenants ?? []).map(tenant => [tenant.name])} /><DataTable title="Användare" headers={["Namn", "E-post", "Roll"]} rows={(data.users ?? []).map(user => [user.name, user.email, user.role])} /><DataTable title="Attestregler" headers={["Namn", "Från belopp (SEK)", "Till belopp (SEK)", "Antal steg", "Aktiv"]} rows={(data.approvalFlows ?? []).map(flow => [flow.name, money(flow.minAmount, "SEK"), flow.maxAmount === null ? "Ingen övre gräns" : money(flow.maxAmount, "SEK"), flow.requiredSteps, flow.active ? "Ja" : "Nej"])} /></>;
  }

  return <div className="dashboard-layout"><Sidebar isOpen={isOpen} onToggle={() => setIsOpen(open => !open)} onClose={() => setIsOpen(false)} /><button type="button" className={`sidebar-overlay${isOpen ? " is-open" : ""}`} onClick={() => setIsOpen(false)} aria-label="Stäng meny" /><main className="dashboard-main portal-main"><header className="dashboard-header"><div className="dashboard-header-title"><h1>{config.title}</h1><p>{config.description}</p></div></header><div className="dashboard-content portal-content">{loading ? <p role="status">Hämtar uppgifter…</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="portal-action" onClick={() => { setLoading(true); setError(""); setRetry(value => value + 1); }}>Försök igen</button></div> : content()}</div></main></div>;
}
