import type { ReactNode } from "react";

interface StatusBadgeProps {
  status?: "success" | "pending" | "processing" | "rejected" | "failed"; 
  className?: string;
  children?: ReactNode;
}

export default function StatusBadge({
  status,
  className = "",
  children,
}: StatusBadgeProps) {
  const statusClass = status ? `status-badge--${status}` : "";

  return (
    <span className={`status-badge ${statusClass} ${className}`}>
      {children}
    </span>
  );
}
