import Link from "next/link";
import { Suspense } from "react";
import { FolderKanban, KeyRound, LayoutDashboard, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { Mark } from "@/modules/landing/icons";

export type NavKey = "overview" | "vault" | "projects" | "settings" | "admin";

type NavItem = { key?: NavKey; label: string; icon: LucideIcon; href?: string };

// Only pages that exist get a link. The rest are shown as "Soon" so there are no dead links.
const items: NavItem[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { key: "vault", label: "Vault", icon: KeyRound, href: "/dashboard/vault" },
  { key: "projects", label: "Projects", icon: FolderKanban, href: "/dashboard/projects" },
  { key: "settings", label: "Settings", icon: Settings, href: "/dashboard/settings" },
];

/** The Admin link exists only for admins. Nobody else even sees that the page is there. */
async function AdminNavItem({ active }: { active: NavKey }) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return null;
  return (
    <Link className={`dash-nav-item${active === "admin" ? " is-active" : ""}`} href="/dashboard/admin" aria-current={active === "admin" ? "page" : undefined}>
      <ShieldCheck aria-hidden="true" /> Admin
    </Link>
  );
}

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
        {/* Reads the session cookie (request-time data), so it streams in inside Suspense. */}
        <Suspense fallback={null}>
          <AdminNavItem active={active} />
        </Suspense>
      </nav>

      <p className="dash-side-note">Early days. More of Dotkeep is on the way.</p>
    </aside>
  );
}
