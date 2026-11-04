"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, BookOpen, FolderKanban, KeyRound, LayoutDashboard, Plus, Search, Settings, type LucideIcon } from "lucide-react";
import { Mark } from "./icons";

// A small copy of the real Vault page: the same sidebar entries, the same table columns, the same environment badges.
// Everything in it is sample data. Keep it in step with the app: if a feature isn't in the dashboard, it doesn't belong here.
const nav: { label: string; icon: LucideIcon; active?: boolean }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Vault", icon: KeyRound, active: true },
  { label: "Projects", icon: FolderKanban },
  { label: "Activity", icon: Activity },
  { label: "Settings", icon: Settings },
  { label: "Docs", icon: BookOpen },
];

const rows = [
  { name: "DATABASE_URL", type: "Database URL", env: "production", envLabel: "Production", sample: "postgres://demo@db/app" },
  { name: "STRIPE_SECRET_KEY", type: "API key", env: "production", envLabel: "Production", sample: "sk_demo_4eC39Hq" },
  { name: "SLACK_WEBHOOK_URL", type: "Webhook URL", env: "staging", envLabel: "Staging", sample: "https://hooks.demo/T0…" },
  { name: "NODE_ENV", type: "Environment variable", env: "local", envLabel: "Local", sample: "development" },
];

// Each pass types a query, reveals the matching value briefly, then clears. This is what the real search and Reveal do.
const script = [
  { query: "stripe", match: "STRIPE_SECRET_KEY" },
  { query: "database", match: "DATABASE_URL" },
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
  const matches = (row: (typeof rows)[number]) => !q || `${row.name} ${row.type} ${row.envLabel}`.toLowerCase().includes(q);

  return (
    <div className="preview-wrap" ref={wrapRef} onPointerMove={tilt} onPointerLeave={resetTilt} role="img" aria-label="Preview of the Dotkeep vault page, with sample data">
      <div className="preview-window">
        <div className="window-bar"><div className="window-dots"><i /><i /><i /></div><div className="window-address">Vault · Dotkeep</div><span className="window-action" /></div>
        <div className="pv" aria-hidden="true">
          <aside className="pv-side">
            <div className="pv-brand"><Mark /> dotkeep</div>
            {nav.map(({ label, icon: NavIcon, active }) => (
              <div key={label} className={`pv-nav${active ? " is-active" : ""}`}><NavIcon /> {label}</div>
            ))}
          </aside>
          <div className="pv-main">
            <div className="pv-head">
              <div>
                <h3>Vault</h3>
                <p>Every secret in every project.</p>
              </div>
              <span className="pv-button"><Plus /> New secret</span>
            </div>
            <div className="pv-toolbar">
              <div className={`pv-search${query ? " is-typing" : ""}`}><Search /> <span>{query || "Search secrets"}</span></div>
              <span className="pv-filter">All environments</span>
            </div>
            <div className="pv-table">
              <div className="pv-row pv-th"><span>Name</span><span>Environment</span><span>Value</span></div>
              {rows.map((row) => {
                const hit = matches(row);
                const state = [q && !hit ? "is-dim" : "", q && hit ? "is-match" : "", revealed === row.name ? "is-revealed" : ""].join(" ");
                return (
                  <div className={`pv-row ${state}`} key={row.name}>
                    <span className="pv-name"><b>{row.name}</b><small>{row.type}</small></span>
                    <span><span className="vt-env" data-env={row.env}>{row.envLabel}</span></span>
                    <span className="pv-value"><span className="pv-mask">••••••••••••</span><span className="pv-real">{row.sample}</span></span>
                  </div>
                );
              })}
            </div>
            <p className="pv-foot">Sample data. Values stay hidden until you reveal them.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
