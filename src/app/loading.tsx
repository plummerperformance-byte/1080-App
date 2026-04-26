export default function Loading() {
  return (
    <div className="flex items-center gap-3 text-sm text-ppa-muted">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-ppa-accent" />
      Loading…
    </div>
  );
}
