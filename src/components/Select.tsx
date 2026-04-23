import type { SelectHTMLAttributes } from "react";

type Option = { value: string; label: string };

type SelectProps = {
  label: string;
  options: ReadonlyArray<Option>;
} & SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ label, options, ...selectProps }: SelectProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-ppa-muted">
        {label}
      </span>
      <select
        {...selectProps}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-ppa-navy focus:outline-none focus:ring-1 focus:ring-ppa-navy"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
