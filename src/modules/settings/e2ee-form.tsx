"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Download, Lock, LockOpen, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { changePassphrase, checkPassphrase, createVault, type VaultKeyRecord } from "@/lib/e2ee";
import { isUnlocked, lockVault, openValue, sealValue, setUnlocked, subscribeToLock } from "@/modules/e2ee/vault-key";
import { api, apiGet } from "@/modules/vault/client-api";
import { download } from "@/modules/vault/env-transfer-dialog";
import { PasswordField } from "./password-field";
import { StatusNote, type Status } from "./status-note";

type LegacySecret = { id: string; name: string; value: string; versions: { id: string; value: string }[] };
type Migrated = { migrated: number; failed: { id: string; error: string }[] };

const BATCH = 50;

/**
 * Settings -> "End-to-end encryption". Turning it on makes a vault key in this browser, protected by a passphrase that only you know
 * and by a recovery key shown once. The server stores the protected keys and ciphertext, so it can no longer read the values.
 */
export function E2eeForm({ enabled }: { enabled: boolean }) {
  return enabled ? <EnabledPanel /> : <SetupPanel />;
}

function SetupPanel() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [created, setCreated] = useState<{ record: VaultKeyRecord; recoveryKey: string; vaultKey: CryptoKey } | null>(null);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "saving";

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = checkPassphrase(passphrase);
    if (problem) return setStatus({ kind: "error", message: problem });
    if (passphrase !== confirm) return setStatus({ kind: "error", message: "The two passphrases don’t match." });
    setStatus({ kind: "saving" });
    try {
      setCreated(await createVault(passphrase)); // slow on purpose: it makes guessing the passphrase slow too
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Couldn’t create the keys." });
    }
  }

  async function finish() {
    if (!created || busy) return;
    setStatus({ kind: "saving" });
    const result = await api<{ userId: string }>("POST", "/api/account/e2ee", { record: created.record });
    if (!result.ok) return setStatus({ kind: "error", message: result.error });
    const keys = await apiGet<{ userId: string }>("/api/account/e2ee");
    if (keys.ok) setUnlocked(created.vaultKey, keys.data.userId);
    router.refresh();
  }

  if (created) {
    return (
      <FieldGroup>
        <p className="st-verified"><TriangleAlert aria-hidden="true" /> Save your recovery key now. It is shown only once.</p>
        <code className="vt-value-input" style={{ display: "block", padding: "12px", wordBreak: "break-all", userSelect: "all" }}>{created.recoveryKey}</code>
        <FieldDescription>
          If you forget your passphrase, this key is the only way back in. Nobody at Dotkeep can recover your secrets without your passphrase or this key.
          Keep it somewhere safe, away from this browser, like a password manager or a printout.
        </FieldDescription>
        <div className="st-actions">
          <Button type="button" variant="outline" onClick={() => download(`Dotkeep recovery key\n\n${created.recoveryKey}\n\nKeep this file private. Anyone who has it and can sign in to your account can read your secrets.\n`, "dotkeep-recovery-key.txt")}>
            <Download aria-hidden="true" /> Download
          </Button>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved my recovery key somewhere safe.
        </label>
        <div className="st-actions">
          <Button type="button" disabled={!saved || busy} onClick={finish}>{busy ? "Turning on…" : "Turn on end-to-end encryption"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setCreated(null); setSaved(false); }}>Back</Button>
          <StatusNote status={status} />
        </div>
      </FieldGroup>
    );
  }

  return (
    <form onSubmit={start} noValidate aria-busy={busy}>
      <FieldGroup>
        <p className="st-hint">
          Your secrets are encrypted in your browser with a key only you can unlock, so the Dotkeep server can no longer read them, even if it is breached.
          It needs a vault passphrase that is separate from your login password.
        </p>
        <PasswordField id="e2ee-pass" label="Vault passphrase" autoComplete="new-password" value={passphrase} onChange={(v) => { setPassphrase(v); setStatus({ kind: "idle" }); }} />
        <PasswordField id="e2ee-confirm" label="Confirm passphrase" autoComplete="new-password" value={confirm} onChange={(v) => { setConfirm(v); setStatus({ kind: "idle" }); }} />
        <FieldDescription>At least 12 characters. A few random words work well. It can’t be reset by email: only your recovery key can.</FieldDescription>
        <p className="st-hint">
          Good to know: shared projects keep server-side encryption (a teammate needs to be able to read them), and importing a .env file or restoring
          a backup is not available while this is on.
        </p>
        <div className="st-actions">
          <Button type="submit" disabled={busy}>{busy ? "Creating keys…" : "Continue"}</Button>
          <StatusNote status={status} />
        </div>
      </FieldGroup>
    </form>
  );
}

function EnabledPanel() {
  const unlocked = useSyncExternalStore(subscribeToLock, isUnlocked, () => false);
  const [mode, setMode] = useState<"idle" | "change">("idle");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const busy = status.kind === "saving";

  async function migrate() {
    if (busy) return;
    setStatus({ kind: "saving" });
    try {
      const legacy = await api<{ secrets: LegacySecret[] }>("POST", "/api/vault/e2ee/legacy");
      if (!legacy.ok) return setStatus({ kind: "error", message: legacy.error });
      const secrets = legacy.data.secrets;
      if (!secrets.length) return setStatus({ kind: "saved", message: "Nothing to encrypt. Every secret that can be end-to-end is." });

      // Encrypt everything first and check each result opens again, so a mistake can't overwrite a good value with a broken one.
      const items = [];
      for (const secret of secrets) {
        const cipher = await sealValue(secret.id, secret.value);
        if ((await openValue(secret.id, cipher)) !== secret.value) throw new Error("A check failed, so nothing was changed.");
        const versions = [];
        for (const version of secret.versions) {
          const old = await sealValue(secret.id, version.value);
          if ((await openValue(secret.id, old)) !== version.value) throw new Error("A check failed, so nothing was changed.");
          versions.push({ id: version.id, cipher: old });
        }
        items.push({ id: secret.id, cipher, versions });
      }

      let migrated = 0;
      const failed: Migrated["failed"] = [];
      for (let i = 0; i < items.length; i += BATCH) {
        const result = await api<Migrated>("POST", "/api/vault/e2ee/migrate", { items: items.slice(i, i + BATCH) });
        if (!result.ok) throw new Error(result.error);
        migrated += result.data.migrated;
        failed.push(...result.data.failed);
      }
      const names = new Map(secrets.map((s) => [s.id, s.name]));
      setStatus(
        failed.length
          ? { kind: "error", message: `Encrypted ${migrated}. ${failed.length} could not be: ${failed.map((f) => `${names.get(f.id) ?? f.id} (${f.error})`).join("; ")}` }
          : { kind: "saved", message: `Encrypted ${migrated} ${migrated === 1 ? "secret" : "secrets"}, including their history.` },
      );
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  }

  async function change(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!current) return setStatus({ kind: "error", message: "Enter your current passphrase." });
    const problem = checkPassphrase(next);
    if (problem) return setStatus({ kind: "error", message: problem });
    if (next !== confirm) return setStatus({ kind: "error", message: "The two new passphrases don’t match." });
    setStatus({ kind: "saving" });
    try {
      const keys = await apiGet<{ userId: string; record: VaultKeyRecord }>("/api/account/e2ee");
      if (!keys.ok) throw new Error(keys.error);
      const updated = await changePassphrase(keys.data.record, { passphrase: current }, next);
      const saved = await api("PATCH", "/api/account/e2ee", { record: updated.record });
      if (!saved.ok) throw new Error(saved.error);
      setUnlocked(updated.vaultKey, keys.data.userId);
      setMode("idle");
      setCurrent("");
      setNext("");
      setConfirm("");
      setStatus({ kind: "saved", message: "Passphrase changed. Your recovery key is the same." });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  }

  if (mode === "change") {
    return (
      <form onSubmit={change} noValidate aria-busy={busy}>
        <FieldGroup>
          <PasswordField id="e2ee-current" label="Current passphrase" autoComplete="current-password" value={current} onChange={(v) => { setCurrent(v); setStatus({ kind: "idle" }); }} />
          <PasswordField id="e2ee-next" label="New passphrase" autoComplete="new-password" value={next} onChange={(v) => { setNext(v); setStatus({ kind: "idle" }); }} />
          <PasswordField id="e2ee-next-confirm" label="Confirm new passphrase" autoComplete="new-password" value={confirm} onChange={(v) => { setConfirm(v); setStatus({ kind: "idle" }); }} />
          <div className="st-actions">
            <Button type="submit" disabled={busy}>{busy ? "Changing…" : "Change passphrase"}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setMode("idle"); setStatus({ kind: "idle" }); }}>Cancel</Button>
            <StatusNote status={status} />
          </div>
        </FieldGroup>
      </form>
    );
  }

  return (
    <FieldGroup>
      <p className="st-verified"><ShieldCheck aria-hidden="true" /> On. New secrets are encrypted in your browser.</p>
      <p className="st-hint">
        {unlocked ? <><LockOpen aria-hidden="true" className="vt-inline-icon" /> Unlocked in this tab. It locks again when you reload the page.</> : <><Lock aria-hidden="true" className="vt-inline-icon" /> Locked. You’ll be asked for your passphrase when you read or save a secret.</>}
      </p>
      <div className="st-actions">
        <Button type="button" onClick={migrate} disabled={busy}>{busy ? "Encrypting…" : "Encrypt existing secrets"}</Button>
        <Button type="button" variant="outline" onClick={() => { setStatus({ kind: "idle" }); setMode("change"); }} disabled={busy}>Change passphrase</Button>
        {unlocked && <Button type="button" variant="outline" onClick={lockVault} disabled={busy}>Lock now</Button>}
        <StatusNote status={status} />
      </div>
      <p className="st-hint">
        “Encrypt existing secrets” moves secrets you saved before turning this on, history included. Secrets in shared projects stay server-encrypted.
        End-to-end encryption can’t be turned off yet.
      </p>
    </FieldGroup>
  );
}
