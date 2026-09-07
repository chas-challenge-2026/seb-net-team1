import { useState } from "react";
import type { ChangeEvent } from "react";
import type { User } from "../../types/User";
import { FiBell, FiSearch } from "react-icons/fi";

interface DashboardHeaderProps {
  user: User;
  onSearch?: (value: string) => void;
  onNotificationClick?: () => void;
}

export default function DashboardHeader({
    user,
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
  <header>
    <div>
        <h1>Översikt</h1>
        <p>Välkommen, {user.name}!</p>
    </div>

    <div className="dashboard-search">
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
        type="button"
        onClick={onNotificationClick}
        aria-label="Notifikationer"
    >
        <FiBell />
    </button>
</div>
</header>
    );
}