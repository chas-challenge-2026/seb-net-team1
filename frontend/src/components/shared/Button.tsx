import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps 
extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  className?: string;
}

export default function Button({
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button className={`button ${className}`} {...props}>
      {children}
    </button>
  );
}