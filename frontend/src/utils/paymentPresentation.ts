type BadgePresentation = {
  label: string;
  variant?: "success" | "pending" | "rejected";
};

export function formatPaymentId(id: number): string {
  return Number.isSafeInteger(id) && id > 0 ? `PAY-${String(id).padStart(5, "0")}` : "—";
}

export function formatPaymentListDate(value: string, now = new Date()): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";

  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const time = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(date);

  if (day === today) return `Idag, ${time}`;
  if (day === yesterday) return `Igår, ${time}`;

  const month = new Intl.DateTimeFormat("sv-SE", { month: "short" }).format(date).replace(/\.$/, "");
  return `${date.getDate()} ${month}, ${time}`;
}

export function getPaymentStatus(status: string | null): BadgePresentation {
  switch (status) {
    case "completed": return { label: "Genomförd", variant: "success" };
    case "pending_approval": return { label: "Väntar godkännande", variant: "pending" };
    case "rejected": return { label: "Avvisad", variant: "rejected" };
    default: return { label: status || "—" };
  }
}

export function formatPaymentAmount(amount: string | null, currency: string | null, decimals = false): string {
  if (!amount || !currency) return "—";

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return `${amount} ${currency}`;

  // Keep money as decimal text; grouping must not introduce floating-point rounding.
  const whole = match[1].replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const formatted = `${whole}${decimals || fraction !== "00" ? `,${fraction}` : ""}`;
  return `${formatted} ${currency === "SEK" ? "kr" : currency}`;
}

export function formatPaymentDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm",
  }).format(date);
}
