"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { SidebarActivityBadge } from "./sidebar-activity-badge";

const NAV_ITEMS = [
  { href: "/", label: "Neue Kampagne", n: "01" },
  { href: "/campaigns", label: "Kampagnen", n: "02" },
  { href: "/review", label: "Review-Queue", n: "03" },
  { href: "/pipeline", label: "Pipeline (Live)", n: "04" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-low border-r border-border-subtle z-50 flex flex-col justify-between">
      <div className="flex flex-col">
        <div className="h-16 px-4 flex items-center gap-3 border-b border-border-subtle">
          <Logo className="h-8 w-8 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="font-sans text-title-md tracking-tight text-primary">Social Media Agent</span>
            <span className="font-sans text-mono-data text-ink-muted uppercase tracking-widest">Interne Agentur</span>
          </div>
        </div>
        <div className="px-4 py-3 border-b border-border-subtle bg-surface-bone">
          <div className="flex items-center justify-between">
            <span className="font-sans text-label-sm text-ink-muted uppercase">Orchestrierung</span>
            <SidebarActivityBadge />
          </div>
        </div>
        <nav className="flex flex-col py-3 px-2 gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded text-body-md transition-colors flex items-center justify-between border ${
                  active
                    ? "bg-surface-subtle text-primary border-border-subtle font-semibold"
                    : "text-on-surface-variant hover:bg-surface-subtle hover:text-on-surface border-transparent"
                }`}
              >
                <span>{item.label}</span>
                <span className="font-sans text-mono-data text-ink-muted">{item.n}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="p-4 border-t border-border-subtle bg-surface-bone flex flex-col gap-2">
        <div className="flex items-center justify-between font-sans text-mono-data text-ink-muted">
          <span>Workspace:</span>
          <span className="text-primary">Interne Agentur</span>
        </div>
      </div>
    </aside>
  );
}
