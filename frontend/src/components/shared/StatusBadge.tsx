import type { ReactNode } from "react";

interface StatusBadgeProps {
  //status: "active" | "inactive" | "pending"; Lägg till array av statusar senare.
  className?: string;
  children?: ReactNode;
}

export default function StatusBadge({
  className = "",
  children,
}: StatusBadgeProps) {
  const statusClass = `status-badge  ${className}`;

  return (
    <span className={statusClass}>
      {children }
    </span>
  );
}
