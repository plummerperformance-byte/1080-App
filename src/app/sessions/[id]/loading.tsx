export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-1/3 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-200" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-lg bg-gray-200" />
      <div className="h-72 animate-pulse rounded-lg bg-gray-200" />
    </div>
  );
}
