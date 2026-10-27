"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

type NavLinkProps = { href: string; exact?: boolean; children: React.ReactNode };

function ActiveNavLink({ href, exact = false, children }: NavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));
  return (
    <Link className={`dash-nav-item${active ? " is-active" : ""}`} href={href} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}

/**
 * A sidebar link that knows whether its page is the current one. It reads the URL itself, so the sidebar can live in the
 * shared dashboard layout (which doesn't re-render when you move between pages) and still highlight the right item.
 *
 * On pages with a dynamic part in the URL (like /dashboard/projects/[id]) the pathname isn't known while the page is being
 * prerendered, so usePathname() has to sit inside Suspense. The fallback is the same link without the highlight, so nothing
 * shifts when the highlight appears.
 */
export function NavLink(props: NavLinkProps) {
  return (
    <Suspense fallback={<Link className="dash-nav-item" href={props.href}>{props.children}</Link>}>
      <ActiveNavLink {...props} />
    </Suspense>
  );
}
