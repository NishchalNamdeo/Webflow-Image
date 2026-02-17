import React from "react";

type ReactNode = React.ReactNode;

export function Card({ children }: { children?: ReactNode }) {

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  const base =
    "relative inline-flex items-center justify-center px-3 py-2 text-sm font-medium transition " +
    "focus:outline-none focus:ring-2 focus:ring-gray-300/60 focus:ring-offset-2 focus:ring-offset-white " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  const styles: Record<ButtonVariant, string> = {
    primary:
      "rounded-[12px] text-white mt-2 " +
      "bg-gradient-to-r from-[#46bec0] to-[#154555] " +
      "border border-gray-300/90 " +
      "shadow-[0_10px_18px_rgba(0,0,0,0.18)] " +
      "hover:shadow-[0_12px_22px_rgba(0,0,0,0.22)] " +
      "active:translate-y-[1px] active:shadow-[0_8px_16px_rgba(0,0,0,0.20)] " ,
     
    secondary:
      "rounded-[12px] text-white mt-2 " +
      "bg-gradient-to-r from-[#46bec0] to-[#154555] " +
      "border border-gray-300/90 " +
      "shadow-[0_10px_18px_rgba(0,0,0,0.18)] " +
      "hover:shadow-[0_12px_22px_rgba(0,0,0,0.22)] " +
      "active:translate-y-[1px] active:shadow-[0_8px_16px_rgba(0,0,0,0.20)] ",
      

    danger:
      "rounded-[12px] text-white mt-2 " +
      "bg-gradient-to-r from-[#46bec0] to-[#154555] " +
      "border border-gray-300/90 " +
      "shadow-[0_10px_18px_rgba(0,0,0,0.18)] " +
      "hover:shadow-[0_12px_22px_rgba(0,0,0,0.22)] " +
      "active:translate-y-[1px] active:shadow-[0_8px_16px_rgba(0,0,0,0.20)] ",

    ghost:
      "rounded-[12px] text-white  " +
      "bg-gradient-to-r from-[#46bec0] to-[#154555] " +
      "border border-gray-300/90 " +
      "shadow-[0_10px_18px_rgba(0,0,0,0.18)] " +
      "hover:shadow-[0_12px_22px_rgba(0,0,0,0.22)] " +
      "active:translate-y-[1px] active:shadow-[0_8px_16px_rgba(0,0,0,0.20)] ",
  };

  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      <span className="relative z-10">{children}</span>
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-md border border-gray-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300/60"
      {...props}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-gray-200 px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300/60"
    >
      <option value="">{placeholder || "Select..."}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Pill({
  children,
  active,
  onClick,
  disabled,
}: {
  children?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const base = "inline-flex items-center rounded-md px-3 py-2 text-xs font-medium transition";
  const style = active ? "bg-[#154555] text-white" : "bg-gray-100 text-white-700 hover:bg-[#46bec0]";

  if (onClick) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`${base} ${style} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {children}
      </button>
    );
  }

  return <span className={`${base} bg-gray-100 text-gray-700`}>{children}</span>;
}

export function Spinner() {
  return (
    <div
      className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"
      aria-label="Loading"
    />
  );
}

export function TopBar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-xl font-semibold">{title}</div>
        {subtitle ? <div className="text-sm text-gray-500">{subtitle}</div> : null}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}
