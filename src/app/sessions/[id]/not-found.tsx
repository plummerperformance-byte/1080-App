import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Session not found</h1>
      <p className="mt-2 text-sm text-ppa-muted">
        That session doesn&apos;t exist or has been deleted.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-md bg-ppa-navy px-4 py-2 text-sm font-medium text-white hover:bg-black"
      >
        Back to home
      </Link>
    </div>
  );
}
