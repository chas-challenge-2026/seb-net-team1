import { useState } from "react";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import Card from "../components/shared/Card";
import ProfileSettings from "../components/settings/ProfileSettings";
import SettingsNavigation from "../components/settings/SettingsNavigation";
import type { SettingsSection } from "../components/settings/SettingsNavigation";
import "../styles/dashboard.css";
import "../styles/settings.css";

export default function Settings() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<SettingsSection>("profile");

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

      <main className="dashboard-main settings-main">
        <DashboardHeader title="Inställningar" subtitle="" />

        <div className="dashboard-content settings-content">
          <div className="settings-layout">
            <SettingsNavigation selected={selectedSection} onSelect={setSelectedSection} />

            <section className="settings-panel" aria-live="polite">
              {selectedSection === "profile" ? (
                <ProfileSettings />
              ) : (
                <Card className="settings-card settings-placeholder">
                  <h2>{selectedSection === "security" ? "Säkerhet" : "Aviseringar"}</h2>
                  <p>Kommer snart</p>
                </Card>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
