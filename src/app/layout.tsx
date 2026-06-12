import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northwind Expense Review",
  description: "AI-assisted expense pre-review for Northwind Logistics",
};

const navItems = [
  { href: "/", label: "Home" },
  { href: "/submissions/new", label: "New Submission" },
  { href: "/history", label: "History" },
  { href: "/policy-chat", label: "Policy Chat" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Northwind Logistics</p>
                <h1 className="text-lg font-semibold">Expense Pre-Review</h1>
              </div>
              <nav className="flex gap-4 text-sm font-medium text-slate-700">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-2 hover:bg-slate-100"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
