"use client";

// The last resort: used when the root layout itself fails. It replaces the whole document, so it can't use the
// app's stylesheet or components and carries its own minimal styling.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#fff", color: "#0f1729", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <p style={{ margin: 0, color: "#8a91a3", fontSize: 13, letterSpacing: 1 }}>500</p>
          <h1 style={{ margin: "8px 0", fontSize: 28 }}>Something went wrong</h1>
          <p style={{ color: "#5b6478", lineHeight: 1.6 }}>
            Dotkeep hit an unexpected problem and it has been recorded.
            {error.digest ? <> Quote this error ID if you contact us: <code>{error.digest}</code>.</> : null}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 12, padding: "10px 18px", border: 0, borderRadius: 8, background: "#1d4ed8", color: "#fff", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
