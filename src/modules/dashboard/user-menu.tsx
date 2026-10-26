"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronsUpDown, FolderKanban, KeyRound, LayoutDashboard, LogOut, Settings, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** "Munish Kalra" -> "MK", "munish" -> "M" */
function initials(name: string) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export function UserMenu({ name, email, role }: { name: string; email: string; role: "user" | "admin" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  // On small screens the sidebar is hidden, so the menu carries the navigation links (hidden on desktop by CSS).
  const links = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/vault", label: "Vault", icon: KeyRound },
    { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ...(role === "admin" ? [{ href: "/dashboard/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="dash-user" aria-label="Open account menu">
        <span className="dash-avatar" aria-hidden="true">{initials(name)}</span>
        <span className="dash-user-name">{name}</span>
        <ChevronsUpDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="dash-menu-label">
            <span>{name}</span>
            <small>{email}</small>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="dash-menu-nav" />
        {links.map(({ href, label, icon: LinkIcon }) => (
          <DropdownMenuItem key={href} className="dash-menu-nav" render={<Link href={href} />}>
            <LinkIcon aria-hidden="true" /> {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} disabled={pending}>
          <LogOut aria-hidden="true" /> {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
