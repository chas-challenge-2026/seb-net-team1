import { useState } from "react";
import type { ChangeEvent } from "react";
import type { User } from "../../types/User";
import { FiBell, FiSearch } from "react-icons/fi";
import "../../styles/dashboard.css";

interface DashboardHeaderProps {
  user: User;
    title?: string;
    subtitle?: string;
  onSearch?: (value: string) => void;
  onNotificationClick?: () => void;
}

export default function DashboardHeader({
    user,
    title = "Översikt",
    subtitle,
    onSearch,
    onNotificationClick,
}: DashboardHeaderProps) {
    const [searchValue, setSearchValue] = useState("");

    const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;

        setSearchValue(value);
        onSearch?.(value);
    };

    return (
        <header className="dashboard-header">
            <div className="dashboard-header-title">
                <h1>{title}</h1>
                <p>{subtitle ?? `Välkommen, ${user.name}!`}</p>
            </div>

            <div className="dashboard-header-actions">
                <div className="search-input-wrapper">
        <FiSearch className="dashboard-search-icon" />

                    <input
                        type="search"
                        placeholder="Sök betalningar, konton..."
                        value={searchValue}
                        onChange={handleSearchChange}
                    />
                </div>

                <button
                    className="dashboard-notification-button"
                    type="button"
                    onClick={onNotificationClick}
                    aria-label="Notifikationer"
                >
                    <FiBell className="dashboard-notification-icon" />
                </button>
            </div>
        </header>
    );
}