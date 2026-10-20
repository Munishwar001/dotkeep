import Link from "next/link";
import type { PublicEvent } from "@/db/secret-events";
import { AUDIT_LABELS, environmentLabel } from "./constants";
import { formatDateTime } from "./format";

type ActivityListProps = {
  events: PublicEvent[];
  /** Project id -> name. A project that is gone shows as "deleted project". */
  projectNames?: Record<string, string>;
  /** On a single secret's history the name is already known, so it is left out of each line. */
  showSecret?: boolean;
};

/** The audit log as a list. Used on the Activity page and inside a secret's History dialog. */
export function ActivityList({ events, projectNames, showSecret = true }: ActivityListProps) {
  if (!events.length) return <p className="vt-note">Nothing has happened here yet.</p>;
  return (
    <ul className="vt-activity">
      {events.map((event) => {
        const project = projectNames?.[event.projectId];
        return (
          <li key={event.id} data-action={event.action}>
            <div>
              <b>{AUDIT_LABELS[event.action]}</b>
              {showSecret && (
                <>
                  {" "}
                  <span className="vt-activity-name">{event.secretName}</span>
                  <span className="vt-env" data-env={event.environment}>{environmentLabel(event.environment)}</span>
                </>
              )}
              {event.actorName && <span className="vt-activity-detail"> · by {event.actorName}</span>}
              {event.detail && <span className="vt-activity-detail"> · {event.detail}</span>}
              {showSecret && projectNames && (
                <small>
                  {project ? <Link href={`/dashboard/projects/${event.projectId}`}>{project}</Link> : "deleted project"}
                </small>
              )}
            </div>
            <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
          </li>
        );
      })}
    </ul>
  );
}
