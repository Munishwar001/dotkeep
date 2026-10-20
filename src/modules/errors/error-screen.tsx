import Link from "next/link";
import { Mark } from "@/modules/landing/icons";

type ErrorScreenProps = {
  code: string; // "404", "500"
  title: string;
  text: string;
  /** Next's error id. Quoting it lets someone find the matching entry in the logs. */
  digest?: string;
  children?: React.ReactNode; // buttons
};

/** The full-page layout shared by the 404 and error pages. Plain markup, no hooks, so it also renders on the server. */
export function ErrorScreen({ code, title, text, digest, children }: ErrorScreenProps) {
  return (
    <main className="err">
      <Link className="wordmark" href="/" aria-label="Dotkeep home"><Mark /><span>dotkeep</span></Link>
      <div className="err-card">
        <p className="err-code">{code}</p>
        <h1>{title}</h1>
        <p className="err-text">{text}</p>
        {digest && <p className="err-digest">Error ID: <code>{digest}</code></p>}
        <div className="err-actions">{children}</div>
      </div>
    </main>
  );
}
