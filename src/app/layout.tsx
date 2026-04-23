import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PPA 1080 Sprint Analyser",
  description:
    "Plummer Performance Academy — sprint session analysis and trend tracking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="inline-block h-6 w-6 rounded bg-ppa-red" />
              <span className="text-lg font-semibold tracking-tight">
                PPA 1080 Sprint Analyser
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/" className="hover:text-ppa-red">
                Home
              </Link>
              <Link href="/athletes" className="hover:text-ppa-red">
                Athletes
              </Link>
              <Link href="/upload" className="hover:text-ppa-red">
                Upload
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
