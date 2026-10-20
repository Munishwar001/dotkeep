import Link from "next/link";
import { ArrowLeft, ArrowRight, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminStats, AdminUserRow } from "@/db/admin";
import { formatDate } from "@/modules/vault/format";
import { MaskEmailsToggle, UserActions } from "./admin-actions";

const reveal = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function StatTiles({ stats }: { stats: AdminStats }) {
  const tiles = [
    { label: "Registered users", value: stats.totalUsers, hint: `${stats.admins} admin${stats.admins === 1 ? "" : "s"}${stats.unverified ? ` · ${stats.unverified} unverified` : ""}${stats.blocked ? ` · ${stats.blocked} blocked` : ""}` },
    { label: "New in 7 days", value: stats.newUsers7d, hint: "Signed up this week" },
    { label: "Active in 24 hours", value: stats.active24h, hint: `${stats.active7d} in the last 7 days` },
    { label: "Total logins", value: stats.totalLogins, hint: "All time" },
  ];
  return (
    <section className="dash-stats is-four" aria-label="User statistics">
      {tiles.map((tile, i) => (
        <div className="dash-tile dash-reveal" style={reveal(i)} key={tile.label}>
          <p className="dash-tile-label">{tile.label}</p>
          <p className="dash-tile-value">{tile.value.toLocaleString("en")}</p>
          <p className="dash-tile-hint">{tile.hint}</p>
        </div>
      ))}
    </section>
  );
}

export function LoginsChart({ days }: { days: AdminStats["loginsByDay"] }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const label = (date: string) => new Date(date + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <section className="dash-panel dash-reveal" style={reveal(4)} aria-labelledby="logins-chart">
      <div className="dash-panel-head">
        <h2 id="logins-chart">Logins per day</h2>
        <span className="dash-badge">{total} in 14 days</span>
      </div>
      <ol className="ad-chart" aria-label="Logins per day for the last 14 days">
        {days.map((day) => (
          <li key={day.date} title={`${label(day.date)}: ${day.count} login${day.count === 1 ? "" : "s"}`}>
            <span className="ad-count">{day.count || ""}</span>
            <span className="ad-bar"><i style={{ height: `${(day.count / max) * 100}%` }} /></span>
            <small>{day.date.slice(8)}</small>
            <span className="sr-only">{label(day.date)}: {day.count} logins</span>
          </li>
        ))}
      </ol>
      <p className="dash-panel-note">Days are in UTC. Only the user and the time of each login are recorded: no IP address or device.</p>
    </section>
  );
}

function pageHref(query: string | undefined, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `/dashboard/admin?${text}` : "/dashboard/admin";
}

export function UsersTable({ users, total, page, pages, query, maskEmails }: { users: AdminUserRow[]; total: number; page: number; pages: number; query?: string; maskEmails: boolean }) {
  return (
    <section className="dash-panel dash-reveal ad-users" style={reveal(5)} aria-labelledby="users-heading">
      <div className="dash-panel-head">
        <h2 id="users-heading">Users</h2>
        <div className="ad-head-actions">
          <MaskEmailsToggle masked={maskEmails} />
          <span className="dash-badge">{total.toLocaleString("en")} {query ? "found" : "total"}</span>
        </div>
      </div>

      <form className="ad-search" action="/dashboard/admin" method="get" role="search">
        <label className="vt-search">
          <Search aria-hidden="true" />
          <Input className="h-10 pl-9" type="search" name="q" defaultValue={query ?? ""} placeholder={maskEmails ? "Search by name" : "Search by name or email"} aria-label="Search users" maxLength={80} />
        </label>
        <Button type="submit" variant="outline" className="h-10 px-4">Search</Button>
        {query && <Link className="auth-link" href="/dashboard/admin">Clear</Link>}
      </form>

      {users.length === 0 ? (
        <p className="ad-none">No users match “{query}”.</p>
      ) : (
        <div className="at" role="table" aria-label="Users">
          <div className="at-head" role="row">
            <span role="columnheader">User</span>
            <span role="columnheader">Role</span>
            <span role="columnheader">Joined</span>
            <span role="columnheader">Last login</span>
            <span role="columnheader">Logins</span>
            <span role="columnheader">Projects</span>
            <span role="columnheader">Secrets</span>
            <span role="columnheader"><span className="sr-only">Actions</span></span>
          </div>
          {users.map((user) => (
            <div className="at-row" role="row" key={user.id}>
              <div role="cell" className="at-user"><b>{user.name}{!user.emailVerified && <span className="at-unverified">Unverified</span>}{user.blocked && <span className="at-blocked">Blocked</span>}</b><small>{user.email}</small></div>
              <div role="cell" data-label="Role">
                {user.role === "admin" ? <span className="at-role"><ShieldCheck aria-hidden="true" /> Admin</span> : <span className="at-plain">User</span>}
              </div>
              <div role="cell" data-label="Joined">{formatDate(user.createdAt)}</div>
              <div role="cell" data-label="Last login">{user.lastLoginAt ? formatDate(user.lastLoginAt) : <span className="at-plain">Never</span>}</div>
              <div role="cell" data-label="Logins">{user.loginCount}</div>
              <div role="cell" data-label="Projects">{user.projectCount}</div>
              <div role="cell" data-label="Secrets">{user.secretCount}</div>
              <div role="cell" className="at-actions">{user.role !== "admin" && <UserActions user={{ id: user.id, name: user.name, blocked: user.blocked }} />}</div>
            </div>
          ))}
        </div>
      )}

      {maskEmails && <p className="dash-panel-note">Emails are masked, and search matches names only. Turn masking off to see them.</p>}

      {pages > 1 && (
        <nav className="ad-pager" aria-label="Pagination">
          {page > 1 ? <Link href={pageHref(query, page - 1)}><ArrowLeft aria-hidden="true" /> Previous</Link> : <span aria-disabled="true"><ArrowLeft aria-hidden="true" /> Previous</span>}
          <span>Page {page} of {pages}</span>
          {page < pages ? <Link href={pageHref(query, page + 1)}>Next <ArrowRight aria-hidden="true" /></Link> : <span aria-disabled="true">Next <ArrowRight aria-hidden="true" /></span>}
        </nav>
      )}
    </section>
  );
}
