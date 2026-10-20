import Link from "next/link";
import { FolderKanban, KeyRound, LayoutDashboard, Settings, type LucideIcon } from "lucide-react";
import { Mark } from "@/modules/landing/icons";

export type NavKey = "overview" | "vault" | "projects";

type NavItem = { key?: NavKey; label: string; icon: LucideIcon; href?: string };

// Only pages that exist get a link. The rest are shown as "Soon" so there are no dead links.
const items: NavItem[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { key: "vault", label: "Vault", icon: KeyRound, href: "/dashboard/vault" },
  { key: "projects", label: "Projects", icon: FolderKanban, href: "/dashboard/projects" },
  { label: "Settings", icon: Settings },
];

export function Sidebar({ active }: { active: NavKey }) {
  return (
    <aside className="dash-side">
      <Link className="wordmark" href="/" aria-label="Dotkeep home"><Mark /><span>dotkeep</span></Link>

      <nav className="dash-nav" aria-label="Dashboard">
        <p className="dash-nav-caption">WORKSPACE</p>
        {items.map(({ key, label, icon: ItemIcon, href }) =>
          href ? (
            <Link key={label} className={`dash-nav-item${key === active ? " is-active" : ""}`} href={href} aria-current={key === active ? "page" : undefined}>
              <ItemIcon aria-hidden="true" /> {label}
            </Link>
          ) : (
            <span key={label} className="dash-nav-item is-disabled" aria-disabled="true">
              <ItemIcon aria-hidden="true" /> {label}
              <em>Soon</em>
            </span>
          ),
        )}
      </nav>

      <p className="dash-side-note">Early days. More of Dotkeep is on the way.</p>
    </aside>
  );
}
