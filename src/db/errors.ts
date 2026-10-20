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

export function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
