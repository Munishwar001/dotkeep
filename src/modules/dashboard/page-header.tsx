import { CircleAlert } from "lucide-react";

export function PageHeader({ kicker, title, text, actions }: { kicker: string; title: string; text?: string; actions?: React.ReactNode }) {
  return (
    <header className="dash-pagehead dash-reveal">
      <div>
        <p className="dash-kicker">{kicker}</p>
        <h1>{title}</h1>
        {text && <p className="dash-lead">{text}</p>}
      </div>
      {actions && <div className="dash-pagehead-actions">{actions}</div>}
    </header>
  );
}

/** Shown instead of the page when the server isn't fully set up, so nobody stares at a confusing error. */
export function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div className="auth-alert" role="alert">
      <CircleAlert aria-hidden="true" />
      <p>
        The vault isn’t set up yet. Add {missing.map((name, i) => <span key={name}>{i > 0 && " and "}<code>{name}</code></span>)} to <code>.env.local</code> (see <code>.env.example</code>) and restart the dev server.
      </p>
    </div>
  );
}
