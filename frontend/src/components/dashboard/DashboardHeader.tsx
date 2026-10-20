import { useState } from "react";
import type { ChangeEvent } from "react";
import type { User } from "../../types/User";
import { FiSearch } from "react-icons/fi";
import ApprovalNotifications from "./ApprovalNotifications";
import "../../styles/dashboard.css";

interface DashboardHeaderProps {
    user?: User | null;
    title?: string;
    subtitle?: string;
    showSearch?: boolean;
  onSearch?: (value: string) => void;
}

export default function DashboardHeader({
    user,
    title = "Översikt",
    subtitle,
    showSearch = true,
    onSearch,
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
                <p>{subtitle ?? (user ? `Välkommen, ${user.name}!` : "Laddar dashboard...")}</p>
            </div>

            <div className="dashboard-header-actions">
                {showSearch && (
                <div className="search-input-wrapper">
        <FiSearch className="dashboard-search-icon" />

                    <input
                        type="search"
                        placeholder="Sök betalningar, konton..."
                        aria-label="Sök betalningar och konton"
                        value={searchValue}
                        onChange={handleSearchChange}
                    />
                </div>
                )}

                <ApprovalNotifications user={user} />
            </div>
        </header>
    );
}
