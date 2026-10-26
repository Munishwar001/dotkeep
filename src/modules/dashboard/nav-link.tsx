"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A sidebar link that knows whether its page is the current one. It reads the URL itself, so the sidebar can live in the
 * shared dashboard layout (which doesn't re-render when you move between pages) and still highlight the right item.
 */
export function NavLink({ href, exact = false, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));
  return (
    <Link className={`dash-nav-item${active ? " is-active" : ""}`} href={href} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
