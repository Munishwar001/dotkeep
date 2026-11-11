/** Expected problems the API turns into friendly responses. Anything else is an unexpected 500. */

export class NameTakenError extends Error {
  constructor(message = "That name is already used.") {
    super(message);
    this.name = "NameTakenError";
  }
}

export class LimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Something the end-to-end encryption rules don't allow. `code` tells the browser what to do about it. */
export class E2eeError extends Error {
  constructor(
    message: string,
    readonly code: "e2ee_required" | "e2ee_unavailable" | "e2ee_migrate_first",
  ) {
    super(message);
    this.name = "E2eeError";
  }
}

export function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
