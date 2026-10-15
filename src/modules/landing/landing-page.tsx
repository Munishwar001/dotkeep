const features = [
  { icon: "vault", title: "A vault for the work", text: "Keep API keys, tokens, webhooks, and database credentials together, with a clear home for each one." },
  { icon: "layers", title: "Organized by project", text: "Give every project its own space, then separate local, staging, and production context." },
  { icon: "search", title: "Find it in a moment", text: "Search by name, project, or type instead of retracing your steps through old notes." },
  { icon: "terminal", title: "Your setup, in context", text: "Keep dotfiles and configuration references close to the projects they belong to." },
  { icon: "shield", title: "Privacy by design", text: "A considered foundation for protecting sensitive values as the product takes shape." },
  { icon: "flow", title: "Made for the daily loop", text: "Add, update, and revisit the details you need while moving between projects." },
];

const steps = [
  { number: "01", title: "Create your workspace", text: "Start with a space that reflects the projects and environments you work in." },
  { number: "02", title: "Add your secrets", text: "Save credentials, webhooks, and configuration references with useful context." },
  { number: "03", title: "Find what you need", text: "Search your organized vault and get back to the work in front of you." },
];

function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg aria-hidden="true" className={small ? "brand-mark brand-mark-small" : "brand-mark"} viewBox="0 0 36 36" fill="none">
      <rect x="2" y="2" width="32" height="32" rx="10" fill="currentColor" />
      <path d="M11 13.5h5l2 2h7v8.8a1.7 1.7 0 0 1-1.7 1.7h-10.6a1.7 1.7 0 0 1-1.7-1.7v-9.1a1.7 1.7 0 0 1 1.7-1.7Z" stroke="#F8FAF8" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M15 13v-1.2a3 3 0 0 1 6 0V13m-3 5v3" stroke="#F8FAF8" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Icon({ name, className = "" }: { name: string; className?: string }) {
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

function Wordmark() {
  return <a className="wordmark" href="#top" aria-label="Dotkeep home"><Mark /><span>dotkeep</span></a>;
}

function ProductPreview() {
  const rows = [
    { icon: "hook", color: "lavender", name: "Discord notifications", type: "Webhook URL", project: "launchpad", updated: "2h ago" },
    { icon: "database", color: "mint", name: "Supabase · production", type: "Database", project: "launchpad", updated: "Yesterday" },
    { icon: "key", color: "amber", name: "GitHub personal token", type: "Access token", project: "dotkeep-web", updated: "3 days ago" },
    { icon: "env", color: "blue", name: "Local environment", type: "Configuration", project: "portfolio", updated: "Oct 12" },
  ];
  return (
    <div className="preview-wrap" aria-label="Preview of the Dotkeep vault interface">
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
            <div className="toolbar"><div className="search-field"><Icon name="search" /> Search secrets <kbd>⌘ K</kbd></div><div className="filter-button"><span>☷</span> Filters <i>2</i></div><div className="sort-button">Recently updated <span>⌄</span></div></div>
            <div className="project-label"><span className="project-dot" /> LAUNCHPAD <span className="project-line" /></div>
            <div className="secret-table">
              <div className="table-head"><span>NAME</span><span>VALUE</span><span>UPDATED</span><span /></div>
              {rows.map((row) => <div className="secret-row" key={row.name}><span className="secret-name"><span className={`secret-icon ${row.color}`}><Icon name={row.icon} /></span><span><b>{row.name}</b><small>{row.type} <i>·</i> {row.project}</small></span></span><span className="secret-value">••••••••••••••••</span><span className="secret-updated">{row.updated}</span><span className="row-more">···</span></div>)}
            </div>
            <div className="vault-footer"><span><span className="tiny-lock">⌑</span> Values are hidden by default</span><span>12 items <b>·</b> Updated just now</span></div>
          </div>
        </div>
      </div>
      <div className="preview-note"><span className="note-spark">✳</span><span><b>A little less hunting.</b><br />A lot more making.</span><span className="note-arrow">↗</span></div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main id="top">
      <header className="site-header"><div className="header-inner"><Wordmark /><nav className="desktop-nav" aria-label="Main navigation"><a href="#product">Product</a><a href="#security">Security</a><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a></nav><div className="header-actions"><a className="sign-in" href="#faq">Sign in</a><a className="button button-small" href="#get-started">Get started <Icon name="arrow" /></a></div><details className="mobile-menu"><summary aria-label="Open navigation menu"><span /><span /></summary><nav aria-label="Mobile navigation"><a href="#product">Product</a><a href="#security">Security</a><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a><a href="#get-started">Get started <Icon name="arrow" /></a></nav></details></div></header>

      <section className="hero section-shell"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" /> YOUR DEVELOPMENT SECRETS, ORGANIZED.</div><h1>Everything your projects need.<br /><span>Nothing they should expose.</span></h1><p className="hero-description">Keep API keys, webhooks, environment variables, and developer configurations organized in one secure workspace — built for the way developers actually work.</p><div className="hero-actions"><a className="button" href="#get-started">Get started <Icon name="arrow" /></a><a className="text-link" href="#product">Explore the vault <span>↓</span></a></div><div className="trust-line"><span className="trust-mark"><Icon name="lock" /></span> Built for developers. <span>Designed around privacy.</span></div></div><ProductPreview /></section>

      <div className="logo-strip"><span>YOUR PROJECTS, BETTER ORGANIZED</span><div><span><i className="strip-icon">⌘</i> side projects</span><span><i className="strip-icon">⌂</i> client work</span><span><i className="strip-icon">◈</i> open source</span><span><i className="strip-icon">▣</i> local dev</span></div></div>

      <section className="problem-section section-shell" id="product"><div className="section-kicker">A BETTER KIND OF WORKSPACE</div><div className="problem-heading"><h2>Your projects shouldn’t be held together by scattered secrets.</h2><p>The right credential is rarely where you left it. Dotkeep gives your development setup a little more structure — and your attention back.</p></div><div className="problem-grid"><article className="problem-card"><span className="problem-index">01 / FINDABILITY</span><div className="problem-visual scattered"><span>notes.txt</span><span>.env.local</span><span>old chat ↗</span><span>browser tab</span><span className="scatter-center">?</span></div><h3>Scattered credentials</h3><p>Keys and webhooks end up in notes, chats, and project folders.</p></article><article className="problem-card"><span className="problem-index">02 / CONTEXT</span><div className="problem-visual context"><span className="context-project">launchpad <b>›</b></span><span className="context-key"><i /><b>Production database</b><small>DATABASE_URL</small></span><span className="context-faint">Which one was it?</span></div><h3>Context switching</h3><p>Finding the right value for the right project breaks your flow.</p></article><article className="problem-card"><span className="problem-index">03 / SETUP</span><div className="problem-visual setup"><span><i>⌘</i> MacBook Pro <b>✓</b></span><span><i>▱</i> Workstation <b>!</b></span><span><i>▧</i> New laptop <b>+</b></span></div><h3>Configuration chaos</h3><p>Every project and device seems to have its own setup.</p></article></div><div className="problem-end"><span className="end-rule" /><p>One considered home for the details behind your work.</p><span className="end-rule" /></div></section>

      <section className="features-section section-shell"><div className="features-intro"><div><div className="section-kicker">THE DOTKEEP WORKSPACE</div><h2>Keep the moving parts<br />moving with you.</h2></div><p>Small details have a way of slowing big ideas down. Keep the important ones close, clear, and connected to the work they support.</p></div><div className="feature-grid">{features.map((feature, i) => <article className={`feature-card feature-card-${i + 1}`} key={feature.title}><div className="feature-icon"><Icon name={feature.icon} /></div><span className="feature-number">0{i + 1}</span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div></section>

      <section className="steps-section" id="how-it-works"><div className="section-shell"><div className="steps-top"><div><div className="section-kicker">A PLACE TO START</div><h2>From scattered to sorted.</h2></div><p>A simple rhythm for keeping your development essentials in order.</p></div><div className="steps-grid">{steps.map((step, i) => <article className="step-card" key={step.number}><div className="step-top"><span>{step.number}</span><span className="step-icon"><Icon name={["layers", "key", "search"][i]} /></span></div><div className="step-line"><span /></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></div></section>

      <section className="security-section" id="security"><div className="section-shell security-layout"><div className="security-copy"><div className="section-kicker section-kicker-light"><span /> THOUGHTFUL BY DEFAULT</div><h2>Your secrets deserve more than a text file.</h2><p>Security should shape how a workspace is designed from the start. Dotkeep is being built around a few straightforward principles.</p><ul><li><span>01</span> Keep sensitive values out of source control.</li><li><span>02</span> Protect values before they’re persisted.</li><li><span>03</span> Keep access scoped to the right people.</li><li><span>04</span> Mask sensitive values by default.</li></ul><small className="security-footnote">These are design principles, not a claim of completed security certification or implementation.</small></div><div className="security-visual"><div className="security-visual-head"><span>HOW SENSITIVE DATA SHOULD FLOW</span><span className="design-badge">DESIGN PRINCIPLE</span></div><div className="flow-stage"><div className="flow-node"><span className="flow-node-icon"><Icon name="key" /></span><span className="flow-node-label">YOUR VALUE</span><code>sk_live_••••••••</code><small>Visible to you</small></div><div className="flow-connector"><span>protect</span><i>→</i></div><div className="flow-node encrypted"><span className="flow-node-icon"><Icon name="shield" /></span><span className="flow-node-label">PROTECTED</span><code>••••••••••••••</code><small>Unreadable at rest</small></div></div><div className="storage-row"><span className="storage-icon"><Icon name="database" /></span><span><b>Encrypted storage</b><small>Only protected data is persisted</small></span><span className="storage-status"><i /> PRINCIPLE</span></div><div className="security-visual-bottom"><span><Icon name="lock" /> Privacy is a foundation, not a feature badge.</span><span>DOTKEEP / SECURITY</span></div></div></div></section>

      <section className="faq-section section-shell" id="faq"><div className="faq-intro"><div className="section-kicker">GOOD QUESTIONS</div><h2>A few things<br />worth knowing.</h2><p>Clear answers, no fine print in the footnotes.</p></div><div className="faq-list"><details><summary>Is Dotkeep available yet?<span>+</span></summary><p>Dotkeep is in its early stages. This page introduces the product direction; it doesn’t imply that account creation or vault features are live today.</p></details><details><summary>Does Dotkeep encrypt my secrets?<span>+</span></summary><p>Protecting sensitive values is a core design principle. The product is not yet claiming a verified encryption implementation, certification, or end-to-end encryption.</p></details><details><summary>Can I use Dotkeep with a team?<span>+</span></summary><p>Dotkeep is designed around individual developers and small teams, but team sharing is not presented as an available feature here.</p></details><details><summary>What can I keep in my workspace?<span>+</span></summary><p>The product is being shaped for API keys, tokens, webhooks, database credentials, environment variables, project secrets, and developer configuration references.</p></details></div></section>

      <section className="closing-section" id="get-started"><div className="closing-shell"><div className="closing-mark"><Mark /></div><div className="section-kicker">A CLEARER PLACE TO BUILD FROM</div><h2>Give every secret<br />a proper home.</h2><p>Less searching through files. More time building.</p><a className="button button-light" href="#faq">Get started with Dotkeep <Icon name="arrow" /></a><span className="closing-caption">Early days. A thoughtful foundation.</span><div className="closing-decoration" aria-hidden="true"><span /><span /><span /></div></div></section>

      <footer className="site-footer"><div className="footer-main section-shell"><div className="footer-brand"><Wordmark /><p>A considered home for the details behind your development work.</p></div><div className="footer-links"><div><span>EXPLORE</span><a href="#product">Product</a><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a></div><div><span>PRINCIPLES</span><a href="#security">Security</a><a href="#top">Privacy by design</a></div></div></div><div className="footer-bottom section-shell"><span>© 2026 Dotkeep</span><span>Made for the work behind the work. <Mark small /></span></div></footer>
    </main>
  );
}
