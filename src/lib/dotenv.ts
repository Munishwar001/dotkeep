/**
 * Reads and writes .env files. Supports `export KEY=value`, # comments, 'single' and "double" quotes
 * (a quoted value may span lines), and \n \r \" \\ escapes inside double quotes. No ${VAR} expansion:
 * a value is stored exactly as written.
 */

export type EnvEntry = { name: string; value: string };
export type EnvParseResult = { entries: EnvEntry[]; errors: { line: number; message: string }[] };

/** What a variable name may look like. Secrets named otherwise are left out of an export. */
export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export function parseEnv(content: string): EnvParseResult {
  const lines = content.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const found = new Map<string, EnvEntry>();
  const errors: EnvParseResult["errors"] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([^=\s]+)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      errors.push({ line: lineNumber, message: "Expected NAME=value." });
      continue;
    }
    const [, name, rest] = match;
    if (!ENV_NAME.test(name)) {
      errors.push({ line: lineNumber, message: `“${name}” is not a valid variable name.` });
      continue;
    }

    let value: string;
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      // collect lines until the closing quote
      let text = rest.slice(1);
      let end = closingQuote(text, quote);
      while (end === -1 && i + 1 < lines.length) {
        i += 1;
        text += "\n" + lines[i];
        end = closingQuote(text, quote);
      }
      if (end === -1) {
        errors.push({ line: lineNumber, message: "The quoted value is never closed." });
        continue;
      }
      value = quote === '"' ? text.slice(0, end).replace(/\\([nr"\\])/g, (_, c: string) => (c === "n" ? "\n" : c === "r" ? "\r" : c)) : text.slice(0, end);
    } else {
      value = rest.replace(/\s+#.*$/, "").trim();
    }

    if (!value.trim()) {
      errors.push({ line: lineNumber, message: `“${name}” has no value.` });
      continue;
    }
    found.delete(name); // a repeated name: the last one wins, as in real .env loaders
    found.set(name, { name, value });
  }
  return { entries: [...found.values()], errors };
}

/** Index of the first closing `quote` in `text`, skipping \" in double-quoted values. -1 if there is none. */
function closingQuote(text: string, quote: string): number {
  for (let i = 0; i < text.length; i++) {
    if (quote === '"' && text[i] === "\\") i += 1;
    else if (text[i] === quote) return i;
  }
  return -1;
}

export function serializeEnv(entries: EnvEntry[]): string {
  const lines = entries.map(({ name, value }) => {
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return `${name}=${value}`;
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
    return `${name}="${escaped}"`;
  });
  return lines.length ? lines.join("\n") + "\n" : "";
}
