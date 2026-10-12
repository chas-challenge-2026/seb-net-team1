import { useState } from "react";
import Card from "../shared/Card";
import type { User } from "../../types/User";

type Profile = {
  name: string;
  email: string;
  phone: string;
  role: string;
};

function getLoggedInProfile(): Profile {
  try {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      return { name: "Inloggad användare", email: "", phone: "", role: "Initiativtagare" };
    }

    const user = JSON.parse(storedUser) as User & { phone?: string };
    const roleByBackendValue: Record<string, string> = {
      initiator: "Initiativtagare",
      attestant: "Attestant",
      admin: "Administratör",
    };
    const role = user.role?.trim().toLocaleLowerCase("en-US") ?? "";

    return {
      name: user.name || "Inloggad användare",
      email: user.email || "",
      phone: user.phone ?? "",
      role: roleByBackendValue[role] ?? user.role ?? "Initiativtagare",
    };
  } catch {
    return { name: "Inloggad användare", email: "", phone: "", role: "Initiativtagare" };
  }
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase("sv-SE"))
    .join("") || "?";
}

export default function ProfileSettings() {
  const [savedProfile, setSavedProfile] = useState(getLoggedInProfile);
  const [form, setForm] = useState(getLoggedInProfile);

  function updateField(field: keyof Profile, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavedProfile(form);
  }

  function handleCancel() {
    setForm(savedProfile);
  }

  return (
    <Card className="settings-card">
      <div className="settings-profile-header">
        <div className="settings-avatar" aria-label={`${getInitials(savedProfile.name)} initialer`}>
          {getInitials(savedProfile.name)}
        </div>
        <div className="settings-profile-heading">
          <h2>{savedProfile.name}</h2>
          <p>Företagsanvändare &bull; {savedProfile.role}</p>
          <button className="settings-photo-link" type="button">
            Byt foto
          </button>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="settings-form-grid">
          <div className="settings-field">
            <label htmlFor="settings-full-name">Fullständigt namn</label>
            <input
              id="settings-full-name"
              name="name"
              type="text"
              autoComplete="name"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
            />
          </div>

          <div className="settings-field">
            <label htmlFor="settings-email">E-postadress</label>
            <input
              id="settings-email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
            />
          </div>

          <div className="settings-field">
            <label htmlFor="settings-phone">Telefonnummer</label>
            <input
              id="settings-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
            />
          </div>

          <div className="settings-field">
            <label htmlFor="settings-role">Roll</label>
            <select
              id="settings-role"
              name="role"
              value={form.role}
              disabled
            >
              <option>Initiativtagare</option>
              <option>Attestant</option>
              <option>Administratör</option>
            </select>
          </div>
        </div>

        <div className="settings-form-actions">
          <button className="settings-button settings-button-secondary" type="button" onClick={handleCancel}>
            Avbryt
          </button>
          <button className="settings-button settings-button-primary" type="submit">
            Spara ändringar
          </button>
        </div>
      </form>
    </Card>
  );
}
