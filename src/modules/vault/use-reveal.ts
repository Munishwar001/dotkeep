"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openValue } from "@/modules/e2ee/vault-key";
import { api } from "./client-api";

/**
 * Reveal and copy for secret values. Revealed values live only in this component's memory and hide
 * themselves after `revealSeconds`. A value is only fetched when you click.
 */
export function useReveal(revealSeconds: number) {
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((timer) => window.clearTimeout(timer));
  }, []);

  const hide = useCallback((id: string) => {
    window.clearTimeout(timers.current[id]);
    delete timers.current[id];
    setRevealed((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const fetchValue = useCallback(async (id: string): Promise<string | null> => {
    setBusyId(id);
    setError(null);
    const result = await api<{ value?: string; cipher?: string }>("POST", `/api/vault/secrets/${id}/reveal`);
    if (!result.ok) {
      setBusyId(null);
      setError(result.error);
      return null;
    }
    try {
      // An end-to-end secret comes back encrypted: it is opened here, in the browser, with the vault key.
      return result.data.cipher !== undefined ? await openValue(id, result.data.cipher) : (result.data.value ?? "");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t decrypt this value.");
      return null;
    } finally {
      setBusyId(null);
    }
  }, []);

  const toggleReveal = useCallback(
    async (id: string) => {
      if (revealed[id] !== undefined) return hide(id);
      const value = await fetchValue(id);
      if (value === null) return;
      setRevealed((current) => ({ ...current, [id]: value }));
      timers.current[id] = window.setTimeout(() => hide(id), revealSeconds * 1000);
    },
    [revealed, hide, fetchValue, revealSeconds],
  );

  const copy = useCallback(
    async (id: string) => {
      const value = revealed[id] ?? (await fetchValue(id));
      if (value === null) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopiedId(id);
        window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
      } catch {
        setError("Couldn’t copy to the clipboard. Reveal the value and copy it by hand.");
      }
    },
    [revealed, fetchValue],
  );

  return { revealed, copiedId, busyId, error, hide, toggleReveal, copy };
}
