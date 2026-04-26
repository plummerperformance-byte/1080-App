import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PPA 1080 Sprint Analyser",
  description: "Plummer Performance Academy — sprint analytics + technique video.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-ppa-accent" />
              <span className="font-semibold tracking-tight text-ppa-navy">
                PPA Sprint Analyser
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/" className="text-ppa-muted hover:text-ppa-navy">Home</Link>
              <Link href="/athletes" className="text-ppa-muted hover:text-ppa-navy">Athletes</Link>
              <Link
                href="/upload"
                className="rounded-md bg-ppa-navy px-3 py-1.5 text-white hover:bg-black"
              >
                Upload session
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-6 py-8 text-xs text-ppa-muted">
          PPA · 1080 Sprint Analyser · v0.1
        </footer>
      </body>
    </html>
  );
}
