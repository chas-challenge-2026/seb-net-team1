export type SettingsSection = "profile" | "security" | "notifications";

type SettingsNavigationProps = {
  selected: SettingsSection;
  onSelect: (section: SettingsSection) => void;
};

const sections: { id: SettingsSection; label: string }[] = [
  { id: "profile", label: "Profil" },
  { id: "security", label: "Säkerhet" },
  { id: "notifications", label: "Aviseringar" },
];

export default function SettingsNavigation({
  selected,
  onSelect,
}: SettingsNavigationProps) {
  return (
    <nav className="settings-tabs" aria-label="Inställningssektioner">
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`settings-tab${selected === section.id ? " is-active" : ""}`}
          aria-pressed={selected === section.id}
          onClick={() => onSelect(section.id)}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
