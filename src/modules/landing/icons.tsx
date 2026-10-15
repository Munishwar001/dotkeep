export function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg aria-hidden="true" className={small ? "brand-mark brand-mark-small" : "brand-mark"} viewBox="0 0 36 36" fill="none">
      <rect x="2" y="2" width="32" height="32" rx="10" fill="currentColor" />
      <path d="M11 13.5h5l2 2h7v8.8a1.7 1.7 0 0 1-1.7 1.7h-10.6a1.7 1.7 0 0 1-1.7-1.7v-9.1a1.7 1.7 0 0 1 1.7-1.7Z" stroke="#F8FAF8" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M15 13v-1.2a3 3 0 0 1 6 0V13m-3 5v3" stroke="#F8FAF8" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}


export function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    vault: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11l2 2h8A2.5 2.5 0 0 1 30 9.5v15a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 4 24.5z"/><path d="M4 11h26M15 17v5m0-2.5h5"/></>,
    layers: <><path d="m17 3 13 7-13 7L4 10l13-7Z"/><path d="m4 16 13 7 13-7M4 22l13 7 13-7"/></>,
    search: <><circle cx="13.5" cy="13.5" r="8.5"/><path d="m20 20 7 7"/></>,
    terminal: <><rect x="3" y="4" width="26" height="24" rx="3"/><path d="m9 12 4 4-4 4m8 0h6"/></>,
    shield: <><path d="M17 3 28 7v8c0 7-4.6 11.2-11 14-6.4-2.8-11-7-11-14V7l11-4Z"/><path d="m12 17 3.2 3.2L22 13"/></>,
    flow: <><circle cx="7" cy="8" r="3"/><circle cx="27" cy="24" r="3"/><path d="M10 8h7a5 5 0 0 1 5 5v6a5 5 0 0 0 5 5M7 11v10a3 3 0 0 0 3 3h14"/></>,
    key: <><circle cx="11" cy="17" r="6"/><path d="m15.5 12.5 10-10L30 7l-3 3 2 2-3 3-2-2-4 4m-9-1h.01"/></>,
    database: <><ellipse cx="17" cy="7" rx="11" ry="4"/><path d="M6 7v20c0 2.2 4.9 4 11 4s11-1.8 11-4V7M6 17c0 2.2 4.9 4 11 4s11-1.8 11-4"/></>,
    hook: <><path d="M13 6a5 5 0 1 1 9.6 2H26a4 4 0 0 1 0 8h-3v3a6 6 0 1 1-6-6h1"/><path d="M7 12h4m-2-2v4"/></>,
    env: <><path d="M4 8h26M4 17h26M4 26h26"/><circle cx="12" cy="8" r="2" fill="currentColor"/><circle cx="23" cy="17" r="2" fill="currentColor"/><circle cx="15" cy="26" r="2" fill="currentColor"/></>,
    arrow: <><path d="M5 17h23m-8-8 8 8-8 8"/></>,
    lock: <><rect x="5" y="13" width="24" height="17" rx="3"/><path d="M10 13V9a7 7 0 1 1 14 0v4m-7 7v4"/></>,
  };
  return <svg aria-hidden="true" className={`icon ${className}`} viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
