import { clsx } from "@/lib/clsx";
import type { Rank } from "@/lib/norms";
import { RANK_BG } from "@/lib/norms";

export function Metric({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  hint?: string;
}) {
  const display =
    value == null || value === "" || (typeof value === "number" && !Number.isFinite(value))
      ? "—"
      : typeof value === "number"
        ? value.toFixed(2)
        : value;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ppa-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tabular text-2xl font-semibold text-ppa-navy">{display}</span>
        {unit ? <span className="text-sm text-ppa-muted">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1 text-xs text-ppa-muted">{hint}</div> : null}
    </div>
  );
}

export function RankCard({
  label,
  value,
  unit,
  rank,
  digits = 2,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  rank: Rank;
  digits?: number;
}) {
  const display =
    value == null || !Number.isFinite(value as number) ? "—" : (value as number).toFixed(digits);
  return (
    <div className={clsx("rounded-lg border border-gray-200 p-4", RANK_BG[rank])}>
      <div className="text-xs font-medium uppercase tracking-wide text-ppa-navy/70">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tabular text-2xl font-semibold text-ppa-navy">{display}</span>
        {unit ? <span className="text-sm text-ppa-navy/70">{unit}</span> : null}
      </div>
      <div className="mt-1 text-xs font-medium text-ppa-navy/80">{rank}</div>
    </div>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">{children}</div>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-ppa-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-ppa-muted">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm",
        "focus:border-ppa-accent focus:outline-none focus:ring-1 focus:ring-ppa-accent",
        props.className,
      )}
    />
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode },
) {
  return (
    <select
      {...props}
      className={clsx(
        "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm",
        "focus:border-ppa-accent focus:outline-none focus:ring-1 focus:ring-ppa-accent",
        props.className,
      )}
    >
      {props.children}
    </select>
  );
}

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return (
    <button
      {...props}
      className={clsx(
        "rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary"
          ? "bg-ppa-navy text-white hover:bg-black"
          : "border border-gray-300 bg-white text-ppa-navy hover:bg-gray-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-lg border border-gray-200 bg-white p-5", className)}>
      {title ? (
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ppa-muted">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function Pill({ tone = "default", children }: { tone?: "default" | "warn" | "good"; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "warn"
          ? "bg-yellow-100 text-yellow-900"
          : tone === "good"
            ? "bg-green-100 text-green-900"
            : "bg-gray-100 text-gray-700",
      )}
    >
      {children}
    </span>
  );
}
