/**
 * The unlocked vault key, kept in this browser tab's memory only. It is never written to storage and never sent anywhere, so a page
 * reload locks the vault again and the passphrase is asked for once more.
 *
 * Anything that needs to encrypt or decrypt a value calls sealValue() / openValue(). If the vault is locked they ask the UnlockDialog
 * (mounted in the dashboard layout) to prompt for the passphrase, and carry on when it succeeds, or throw UnlockCancelledError.
 */
import { decryptValue, encryptValue, type VaultKeyRecord } from "@/lib/e2ee";
import { apiGet } from "@/modules/vault/client-api";

export class UnlockCancelledError extends Error {
  constructor() {
    super("The vault stayed locked, so the value could not be encrypted or decrypted.");
    this.name = "UnlockCancelledError";
  }
}

type Unlocked = { key: CryptoKey; userId: string };

let current: Unlocked | null = null;
let askToUnlock: (() => Promise<boolean>) | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export const registerUnlock = (handler: (() => Promise<boolean>) | null) => {
  askToUnlock = handler;
};

/** For useSyncExternalStore: lets a component show "Unlocked" / "Locked" and update when it changes. */
export const subscribeToLock = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export const isUnlocked = () => current !== null;

export function setUnlocked(key: CryptoKey, userId: string) {
  current = { key, userId };
  status = null; // turning it on or unlocking: the cached "is it on" answer may be stale
  notify();
}

/** Only successful status lookups are cached. A failed lookup must stop secret submission. */
let status: Promise<{ enabled: boolean; userId: string | null }> | null = null;
export function e2eeStatus() {
  if (!status) {
    const lookup = apiGet<{ enabled: boolean; userId: string; record: VaultKeyRecord | null }>("/api/account/e2ee").then((result) => {
      if (!result.ok) throw new Error(result.error);
      return { enabled: result.data.enabled, userId: result.data.userId };
    }).catch((error) => {
      if (status === lookup) status = null;
      throw error;
    });
    status = lookup;
  }
  return status;
}

export function lockVault() {
  current = null;
  notify();
}

async function unlocked(): Promise<Unlocked> {
  if (!current && askToUnlock) await askToUnlock();
  if (!current) throw new UnlockCancelledError();
  return current;
}

/** Encrypts a value for the secret with this id. The id and your user id are part of what protects it. */
export async function sealValue(secretId: string, plaintext: string): Promise<string> {
  const { key, userId } = await unlocked();
  return encryptValue(key, plaintext, `${userId}:${secretId}`);
}

export async function openValue(secretId: string, cipher: string): Promise<string> {
  const { key, userId } = await unlocked();
  return decryptValue(key, cipher, `${userId}:${secretId}`);
}
