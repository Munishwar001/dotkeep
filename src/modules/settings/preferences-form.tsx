"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "@/modules/vault/client-api";
import { REVEAL_OPTIONS } from "@/modules/vault/constants";
import { StatusNote, type Status } from "./status-note";

export function PreferencesForm({ revealSeconds }: { revealSeconds: number }) {
  const router = useRouter();
  const [value, setValue] = useState(revealSeconds);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Saves as soon as you pick a value, so there is no Save button to forget.
  async function choose(seconds: number) {
    const previous = value;
    setValue(seconds);
    setStatus({ kind: "saving" });
    const result = await api("PATCH", "/api/account/preferences", { revealSeconds: seconds });
    if (!result.ok) {
      setValue(previous);
      return setStatus({ kind: "error", message: result.error });
    }
    setStatus({ kind: "saved", message: "Saved." });
    router.refresh();
  }

  return (
    <Field>
      <FieldLabel htmlFor="reveal-seconds">Hide revealed secrets after</FieldLabel>
      <div className="st-actions">
        <NativeSelect id="reveal-seconds" className="st-select" value={value} onChange={(e) => choose(Number(e.target.value))}>
          {REVEAL_OPTIONS.map((seconds) => <NativeSelectOption key={seconds} value={seconds}>{seconds} seconds</NativeSelectOption>)}
        </NativeSelect>
        <StatusNote status={status} />
      </div>
      <FieldDescription>After you click Reveal in the vault, the value hides itself again after this long.</FieldDescription>
    </Field>
  );
}
