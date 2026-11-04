"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const COLLAPSED_KEY = "dotkeep.sidebar.collapsed";

// The collapse choice lives in localStorage, so it is read through useSyncExternalStore: the server and the first client
// render both see "expanded", then the saved choice applies without a hydration mismatch.
const listeners = new Set<() => void>();
let collapsedInMemory: boolean | null = null; // used when storage is blocked (private window)

function readCollapsed() {
  if (collapsedInMemory !== null) return collapsedInMemory;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  collapsedInMemory = value;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Not saved, still works for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribeCollapsed(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type ShellState = { navOpen: boolean; collapsed: boolean; toggleNav: () => void; toggleCollapsed: () => void };

const ShellContext = createContext<ShellState | null>(null);

function useShell() {
  const state = useContext(ShellContext);
  if (!state) throw new Error("Dashboard shell controls must be rendered inside <DashShell>.");
  return state;
}

/**
 * Closes the mobile drawer when you move to another page. It is its own component because usePathname() has to sit inside
 * Suspense: on pages with a dynamic part in the URL (like /dashboard/projects/[id]) the pathname is not known while the page
 * is being prerendered, and reading it in the shell itself fails the build. It renders nothing, so nothing can shift.
 */
function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    onNavigate();
  }, [pathname, onNavigate]);
  return null;
}

/**
 * Owns the two bits of sidebar state: the mobile drawer (open or closed) and the desktop collapse (full width or icon rail).
 * It is a client component, but the sidebar and the page are passed in as children, so they stay server-rendered.
 */
export function DashShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const closeNav = useCallback(() => setNavOpen(false), []);
  const toggleNav = useCallback(() => setNavOpen((open) => !open), []);
  const toggleCollapsed = useCallback(() => writeCollapsed(!readCollapsed()), []);

  const value = useMemo(() => ({ navOpen, collapsed, toggleNav, toggleCollapsed }), [navOpen, collapsed, toggleNav, toggleCollapsed]);

  return (
    <ShellContext value={value}>
      <div className="dash" data-collapsed={collapsed} data-nav-open={navOpen}>
        {sidebar}
        <div className="dash-scrim" onClick={closeNav} aria-hidden="true" />
        <Suspense fallback={null}>
          <CloseOnNavigate onNavigate={closeNav} />
        </Suspense>
        <div className="dash-body">{children}</div>
      </div>
    </ShellContext>
  );
}

/** The menu button in the top bar. It only shows on small screens, where the sidebar is a drawer. */
export function MobileNavButton() {
  const { navOpen, toggleNav } = useShell();
  return (
    <button type="button" className="dash-menu-button" onClick={toggleNav} aria-label="Open navigation" aria-expanded={navOpen} aria-controls="dash-sidebar">
      <Menu aria-hidden="true" />
    </button>
  );
}

/** Shrinks the sidebar to an icon rail and back. Hidden on small screens, where the sidebar is a drawer. */
export function CollapseButton() {
  const { collapsed, toggleCollapsed } = useShell();
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button type="button" className="dash-collapse" onClick={toggleCollapsed} aria-pressed={collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
      <CollapseIcon aria-hidden="true" />
      <span className="dash-nav-label">Collapse</span>
    </button>
  );
}
