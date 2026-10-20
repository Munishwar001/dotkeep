import { CircleAlert, CircleCheck } from "lucide-react";

export type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; message: string } | { kind: "error"; message: string };

/** The small "Saved." / error line under a settings form. */
export function StatusNote({ status }: { status: Status }) {
  if (status.kind === "saved") {
    return <p className="st-note is-ok" role="status"><CircleCheck aria-hidden="true" /> {status.message}</p>;
  }
  if (status.kind === "error") {
    return <p className="st-note is-error" role="alert"><CircleAlert aria-hidden="true" /> {status.message}</p>;
  }
  return null;
}
