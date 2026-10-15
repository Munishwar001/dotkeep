"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

const rows = [
  { icon: "hook", color: "lavender", name: "Discord notifications", type: "Webhook URL", project: "launchpad", updated: "2h ago", sample: "https://discord…x9Qa" },
  { icon: "database", color: "mint", name: "Supabase · production", type: "Database", project: "launchpad", updated: "Yesterday", sample: "sbp_9f3a…c71e" },
  { icon: "key", color: "amber", name: "GitHub personal token", type: "Access token", project: "dotkeep-web", updated: "3 days ago", sample: "ghp_Zk82…q4Wd" },
  { icon: "env", color: "blue", name: "Local environment", type: "Configuration", project: "portfolio", updated: "Oct 12", sample: "NODE_ENV=dev…" },
];

// Each pass types a query, reveals the matching value briefly, then clears.
const script = [
  { query: "supa", match: "Supabase · production" },
  { query: "github", match: "GitHub personal token" },
];

export function ProductPreview() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.2 });
    io.observe(wrap);

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    // Time only advances while the preview is on screen.
    const wait = async (ms: number) => {
      await sleep(ms);
      while (!cancelled && !visible) await sleep(300);
    };

    (async () => {
      let pass = 0;
      while (!cancelled) {
        const { query: target, match } = script[pass++ % script.length];
        await wait(1500);
        for (let i = 1; i <= target.length; i++) {
          if (cancelled) return;
          setQuery(target.slice(0, i));
          await wait(170);
        }
        await wait(550);
        if (cancelled) return;
        setRevealed(match);
        await wait(2200);
        setRevealed(null);
        await wait(400);
        for (let i = target.length - 1; i >= 0; i--) {
          if (cancelled) return;
          setQuery(target.slice(0, i));
          await wait(55);
        }
      }
    })();

    return () => { cancelled = true; io.disconnect(); };
  }, []);

  function tilt(event: React.PointerEvent<HTMLDivElement>) {
    const wrap = wrapRef.current;
    if (!wrap || event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = wrap.getBoundingClientRect();
    wrap.style.setProperty("--px", ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
    wrap.style.setProperty("--py", ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
  }

  function resetTilt() {
    wrapRef.current?.style.setProperty("--px", "0");
    wrapRef.current?.style.setProperty("--py", "0");
  }

  const q = query.trim().toLowerCase();
  const matches = (row: (typeof rows)[number]) => !q || `${row.name} ${row.type} ${row.project}`.toLowerCase().includes(q);
  const matchCount = rows.filter(matches).length;

  return (
    <div className="preview-wrap" ref={wrapRef} onPointerMove={tilt} onPointerLeave={resetTilt} aria-label="Preview of the Dotkeep vault interface">
      <div className="preview-window">
        <div className="window-bar"><div className="window-dots"><i /><i /><i /></div><div className="window-address"><span className="address-lock">⌑</span> app.dotkeep.dev / vault</div><span className="window-action">···</span></div>
        <div className="app-shell">
          <aside className="app-sidebar">
            <div className="workspace-switch"><span className="workspace-avatar">m</span><span><b>Munish&apos;s workspace</b><small>Personal</small></span><span className="switch-caret">⌄</span></div>
            <div className="sidebar-caption">WORKSPACE</div>
            <div className="app-nav active"><span className="nav-symbol">▤</span>All secrets<span className="nav-count">12</span></div>
            <div className="app-nav"><span className="nav-symbol">◇</span>Projects</div>
            <div className="app-nav"><span className="nav-symbol">▦</span>Collections</div>
            <div className="sidebar-caption sidebar-caption-lower">PREFERENCES</div>
            <div className="app-nav"><span className="nav-symbol">⚙</span>Settings</div>
            <div className="sidebar-bottom"><span className="avatar-small">M</span><span><b>Munish</b><small>Personal workspace</small></span><span className="more">···</span></div>
          </aside>
          <div className="app-main">
            <div className="app-topline"><div className="breadcrumb">Workspace <span>/</span> All secrets</div><div className="protected"><span /> Vault protected</div></div>
            <div className="vault-heading"><div><div className="vault-overline">PERSONAL WORKSPACE</div><h2>Your vault<span className="vault-period">.</span></h2><p>Everything you need, in the right place.</p></div><span className="new-secret"><span>+</span> New secret</span></div>
            <div className="toolbar"><div className={`search-field${query ? " is-typing" : ""}`}><Icon name="search" /> <span className="search-text">{query || "Search secrets"}</span> <kbd>⌘ K</kbd></div><div className="filter-button"><span>☷</span> Filters <i>2</i></div><div className="sort-button">Recently updated <span>⌄</span></div></div>
            <div className="project-label"><span className="project-dot" /> LAUNCHPAD <span className="project-line" /></div>
            <div className="secret-table">
              <div className="table-head"><span>NAME</span><span>VALUE</span><span>UPDATED</span><span /></div>
              {rows.map((row) => {
                const hit = matches(row);
                const state = [q && !hit ? "is-dim" : "", q && hit ? "is-match" : "", revealed === row.name ? "is-revealed" : ""].join(" ");
                return (
                  <div className={`secret-row ${state}`} key={row.name}>
                    <span className="secret-name"><span className={`secret-icon ${row.color}`}><Icon name={row.icon} /></span><span><b>{row.name}</b><small>{row.type} <i>·</i> {row.project}</small></span></span>
                    <span className="secret-value"><span className="secret-mask">••••••••••••••••</span><span className="secret-real">{row.sample}</span></span>
                    <span className="secret-updated">{row.updated}</span>
                    <span className="row-more">···</span>
                  </div>
                );
              })}
            </div>
            <div className="vault-footer"><span><span className="tiny-lock">⌑</span> Values are hidden by default</span><span>{q ? `${matchCount} of 12` : "12 items"} <b>·</b> Updated just now</span></div>
          </div>
        </div>
      </div>
      <div className="preview-note"><span className="note-spark">✳</span><span><b>A little less hunting.</b><br />A lot more making.</span><span className="note-arrow">↗</span></div>
    </div>
  );
}
