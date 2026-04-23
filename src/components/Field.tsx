import type { InputHTMLAttributes, ReactNode } from "react";

type FieldProps = {
  label: string;
  children?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

export function Field({ label, children, ...inputProps }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-ppa-muted">
        {label}
      </span>
      {children ?? (
        <input
          {...inputProps}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-ppa-navy focus:outline-none focus:ring-1 focus:ring-ppa-navy"
        />
      )}
    </label>
  );
}
