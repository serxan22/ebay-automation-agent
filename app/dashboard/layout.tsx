import Link from "next/link";
import {
  BarChart3,
  Bot,
  Boxes,
  FileText,
  Gauge,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Store,
  Workflow
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/products", label: "Products", icon: Boxes },
  { href: "/dashboard/suppliers", label: "Suppliers", icon: Store },
  { href: "/dashboard/listings", label: "Listings", icon: FileText },
  { href: "/dashboard/automation", label: "Automation", icon: Workflow },
  { href: "/dashboard/telegram", label: "Telegram", icon: Bot },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-ink-200 bg-white/90 p-5 backdrop-blur dark:border-white/10 dark:bg-ink-950/90 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-ink-950 text-white dark:bg-mint-500 dark:text-ink-950">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="font-semibold text-ink-950 dark:text-white">eBay Agent</p>
            <p className="text-xs text-ink-500 dark:text-ink-400">Policy-safe operator</p>
          </div>
        </Link>

        <nav className="mt-8 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-5 left-5 right-5 rounded-lg border border-mint-200 bg-mint-50 p-4 dark:border-mint-500/20 dark:bg-mint-500/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-mint-700 dark:text-mint-300">
            <Gauge size={16} />
            New seller safe mode
          </div>
          <p className="mt-2 text-xs text-mint-900 dark:text-mint-100">
            Manual approval, daily limit 5, restricted categories blocked.
          </p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-ink-200 bg-ink-50/90 px-5 py-4 backdrop-blur dark:border-white/10 dark:bg-ink-950/90 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint-700 dark:text-mint-300">
                Phase 1
              </p>
              <h1 className="text-xl font-semibold text-ink-950 dark:text-white">Automation control center</h1>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-300">
              <span className="size-2 rounded-full bg-amber-500" />
              Sandbox publishing locked
            </div>
          </div>
        </header>
        <main className="px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
