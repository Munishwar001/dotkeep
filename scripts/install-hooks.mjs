// Points git at the hooks in .githooks (runs from `npm install` via the "prepare" script).
// No hook package needed. It never fails the install: outside a git checkout (a tarball, a Docker build) it does nothing.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";

try {
  if (!existsSync(".git")) process.exit(0);
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  if (process.platform !== "win32") chmodSync(".githooks/pre-commit", 0o755); // git only runs executable hooks
} catch {
  // not a git repo, or git isn't installed: skip
}
