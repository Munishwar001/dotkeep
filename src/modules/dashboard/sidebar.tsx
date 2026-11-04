import Link from "next/link";
import { Suspense } from "react";
import { Activity, BookOpen, FolderKanban, KeyRound, LayoutDashboard, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { Mark } from "@/modules/landing/icons";
import { NavLink } from "./nav-link";
import { CollapseButton } from "./shell";

type NavItem = { label: string; icon: LucideIcon; href: string; exact?: boolean };

// Only pages that exist get a link. The rest are shown as "Soon" so there are no dead links.
const items: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard, href: "/dashboard", exact: true },
  { label: "Vault", icon: KeyRound, href: "/dashboard/vault" },
  { label: "Projects", icon: FolderKanban, href: "/dashboard/projects" },
  { label: "Activity", icon: Activity, href: "/dashboard/activity" },
  { label: "Settings", icon: Settings, href: "/dashboard/settings" },
];

/** The Admin link exists only for admins. Nobody else even sees that the page is there. */
async function AdminNavItem() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return null;
  return (
    <NavLink href="/dashboard/admin">
      <ShieldCheck aria-hidden="true" /> <span className="dash-nav-label">Admin</span>
    </NavLink>
  );
}

/**
 * Rendered once by app/dashboard/layout.tsx. A layout isn't rebuilt when you move between dashboard pages, so the sidebar
 * (and the Admin link, which needs a database read) stays put instead of flickering on every click.
 */
export function Sidebar() {
  return (
    <aside className="dash-side" id="dash-sidebar">
      <Link className="wordmark" href="/" aria-label="Dotkeep home"><Mark /><span className="dash-nav-label">dotkeep</span></Link>

      <nav className="dash-nav" aria-label="Dashboard">
        <p className="dash-nav-caption">WORKSPACE</p>
        {items.map(({ label, icon: ItemIcon, href, exact }) => (
          <NavLink key={label} href={href} exact={exact}>
            <ItemIcon aria-hidden="true" /> <span className="dash-nav-label">{label}</span>
          </NavLink>
        ))}
        {/* Reads the session cookie (request-time data), so it streams in inside Suspense. */}
        <Suspense fallback={null}>
          <AdminNavItem />
        </Suspense>
        <NavLink href="/docs">
          <BookOpen aria-hidden="true" /> <span className="dash-nav-label">Docs</span>
        </NavLink>
      </nav>

      <CollapseButton />
    </aside>
  );
}
