import type { CreateRecipientRequest, Recipient, RecipientList } from "../types/Recipient";
import { apiRequest } from "./apiClient";

export const RECIPIENT_NAME_ERROR = "Mottagarens namn måste vara mellan 1 och 100 tecken.";
export const RECIPIENT_IBAN_ERROR = "Ogiltigt IBAN-format. Kontrollera mottagarkontot.";

const confirmationError = "Bekräfta mottagaren med den simulerade bekräftelsen innan du sparar.";
const safeBusinessMessages = new Set([
  RECIPIENT_NAME_ERROR,
  RECIPIENT_IBAN_ERROR,
  confirmationError,
  "En mottagare med detta IBAN finns redan. Den befintliga mottagaren har inte ändrats.",
  "Simulerad bekräftelse av mottagare är inte aktiverad i den här miljön.",
]);

export class RecipientApiError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? (status === 401
      ? "Din inloggning har gått ut. Logga in igen."
      : status === 403
        ? "Du har inte behörighet att lägga till mottagare."
        : status === 409
          ? "En mottagare med detta IBAN finns redan."
          : "Kunde inte spara mottagaren. Försök igen."));
    this.name = "RecipientApiError";
    this.status = status;
  }
}

export function normalizeRecipientIban(iban: string): string {
  return iban.replace(/\s/g, "").toUpperCase();
}

export function getRecipientDetailsError(name: string, iban: string): string | null {
  if (name.trim().length < 1 || name.trim().length > 100) return RECIPIENT_NAME_ERROR;
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(normalizeRecipientIban(iban))) return RECIPIENT_IBAN_ERROR;
  return null;
}

function isRecipient(value: unknown): value is Recipient {
  if (!value || typeof value !== "object") return false;
  const recipient = value as Partial<Recipient>;
  return Number.isSafeInteger(recipient.id) && (recipient.id ?? 0) > 0 &&
    typeof recipient.name === "string" && recipient.name.trim().length > 0 &&
    typeof recipient.iban === "string" &&
    typeof recipient.createdAt === "string";
}

export async function getRecipients(signal?: AbortSignal): Promise<RecipientList> {
  const response = await apiRequest("/api/recipients", { signal });
  if (!response.ok) {
    throw new RecipientApiError(response.status, response.status === 401
      ? "Din inloggning har gått ut. Logga in igen."
      : "Kunde inte hämta sparade mottagare. Försök igen.");
  }

  let list: Partial<RecipientList> | null;
  try {
    list = await response.json();
  } catch {
    throw new RecipientApiError(response.status, "Svaret från mottagartjänsten kunde inte läsas.");
  }
  if (!list || !Array.isArray(list.recipients) || !list.recipients.every(isRecipient)) {
    throw new RecipientApiError(response.status, "Svaret från mottagartjänsten var ofullständigt.");
  }
  return {
    recipients: list.recipients,
    demoConfirmationEnabled: list.demoConfirmationEnabled === true,
  };
}

export async function createRecipient(request: CreateRecipientRequest): Promise<Recipient> {
  const detailsError = getRecipientDetailsError(request.name, request.iban);
  if (detailsError) throw new RecipientApiError(400, detailsError);
  if (request.demoConfirmed !== true) throw new RecipientApiError(400, confirmationError);

  let response: Response;
  try {
    response = await apiRequest("/api/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: request.name.trim(),
        iban: normalizeRecipientIban(request.iban),
        demoConfirmed: true,
      }),
    });
  } catch {
    throw new RecipientApiError(0, "Kunde inte bekräfta att mottagaren sparades. Kontrollera listan innan du försöker igen.");
  }
  if (!response.ok) {
    let message: string | undefined;
    if ([400, 403, 409].includes(response.status)) {
      try {
        const problem = await response.json();
        const detail = problem?.detail ?? problem?.message;
        if (typeof detail === "string" && safeBusinessMessages.has(detail)) message = detail;
      } catch {
        // Empty errors use the safe message for the HTTP status.
      }
    }
    throw new RecipientApiError(response.status, message);
  }

  let recipient: unknown;
  try {
    recipient = await response.json();
  } catch {
    throw new RecipientApiError(response.status, "Svaret från mottagartjänsten kunde inte läsas. Kontrollera listan innan du försöker igen.");
  }
  if (!isRecipient(recipient)) {
    throw new RecipientApiError(response.status, "Svaret från mottagartjänsten var ofullständigt. Kontrollera listan innan du försöker igen.");
  }
  return recipient;
}
