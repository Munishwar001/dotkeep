import { ERROR_RETENTION_DAYS, type PublicServerError } from "@/db/server-errors";
import { formatDateTime } from "@/modules/vault/format";

const reveal = (i: number) => ({ "--i": i }) as React.CSSProperties;

/** The error record on the Admin page: what broke, where, how often, and the id a visitor may have quoted. */
export function ServerErrors({ errors }: { errors: PublicServerError[] }) {
  return (
    <section className="dash-panel dash-reveal" style={reveal(6)} aria-labelledby="errors-heading">
      <div className="dash-panel-head">
        <h2 id="errors-heading">Server errors</h2>
        <span className="dash-badge">{errors.length ? `${errors.length} recent` : "None"}</span>
      </div>
      {errors.length === 0 ? (
        <p className="ad-none">No server errors recorded. Unexpected errors show up here.</p>
      ) : (
        <ul className="ad-errors">
          {errors.map((error) => (
            <li key={error.id}>
              <div>
                <b>{error.name}: {error.message}</b>
                <small>
                  {error.method ? `${error.method} ` : ""}{error.route ?? error.source}
                  {error.digest && <> · ID <code>{error.digest}</code></>}
                </small>
              </div>
              <div className="ad-err-meta">
                <span className="ad-err-count">{`${error.count}×`}</span>
                <br />
                last {formatDateTime(error.lastAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="dash-panel-note">
        Identical errors are counted together. Records are kept for {ERROR_RETENTION_DAYS} days. Messages are scrubbed of emails, passwords in URLs and tokens, and never include request data.
      </p>
    </section>
  );
}
