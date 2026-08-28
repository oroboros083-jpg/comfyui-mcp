/**
 * Errors that carry what to do about them.
 *
 * `defineTool` turns any thrown error into a tool result, but a bare
 * `new Error("Failed to get queue: Not Found")` arrives with nothing the
 * agent can act on - and CLAUDE.md's rule is that a failure naming no remedy
 * makes the remedy undiscoverable at the one moment it is needed.
 *
 * A ToolError carries its own hint, so the guidance lives where the failure
 * is raised - next to the code that knows why it happened - rather than being
 * reconstructed by whichever handler happens to catch it. Handlers that used
 * to exist only to map one error class onto one hint are no longer needed.
 */
export class ToolError extends Error {
  /** What the caller should do next. Surfaced by defineTool. */
  readonly hint?: string;

  constructor(message: string, hint?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.hint = hint;
  }
}

/**
 * The hint for an error, if it has one.
 *
 * A function rather than an `instanceof` at each call site so that an error
 * crossing a module boundary - or a subclass declared elsewhere - is still
 * read correctly.
 */
export function hintFor(error: unknown): string | undefined {
  return error instanceof ToolError ? error.hint : undefined;
}

/**
 * Message and hint as one string.
 *
 * Resources and prompts do not return a ToolResult - the MCP layer turns a
 * thrown error into a protocol error carrying only `message`. Folding the
 * hint in is the only way it reaches the reader on those paths.
 */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const hint = hintFor(error);
  return hint ? `${message}\n\nHint: ${hint}` : message;
}

/**
 * A write refused because the file is not what the caller thinks it is.
 *
 * Its own class because two different situations share the remedy shape but
 * not the remedy itself - the file changed under you, or you never read it -
 * and because `defineTool` must surface this as a FAILURE. Returning a
 * success carrying `written: false` would let a caller that does not inspect
 * the payload carry on believing its graph is on disk, which is the exact
 * silent data loss this check exists to stop.
 */
export class WorkflowConflictError extends ToolError {}
