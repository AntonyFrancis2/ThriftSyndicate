// An expected failure the UI can show to the user (as opposed to a bug).
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
