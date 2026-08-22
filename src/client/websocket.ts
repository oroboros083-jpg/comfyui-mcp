import WebSocket from "ws";
import { EventEmitter } from "events";

export interface ProgressMessage {
  type: "progress";
  data: {
    value: number;
    max: number;
    prompt_id: string;
    node: string;
  };
}

export interface ExecutingMessage {
  type: "executing";
  data: {
    node: string | null;
    prompt_id: string;
  };
}

export interface ExecutedMessage {
  type: "executed";
  data: {
    node: string;
    prompt_id: string;
    output: Record<string, unknown>;
  };
}

export interface ExecutionStartMessage {
  type: "execution_start";
  data: {
    prompt_id: string;
  };
}

export interface ExecutionCachedMessage {
  type: "execution_cached";
  data: {
    prompt_id: string;
    nodes: string[];
  };
}

export interface ExecutionErrorMessage {
  type: "execution_error";
  data: {
    prompt_id: string;
    node_id: string;
    node_type: string;
    exception_message: string;
    exception_type: string;
    traceback: string[];
  };
}

export type ComfyUIMessage =
  | ProgressMessage
  | ExecutingMessage
  | ExecutedMessage
  | ExecutionStartMessage
  | ExecutionCachedMessage
  | ExecutionErrorMessage;

export interface PromptResult {
  success: boolean;
  promptId: string;
  outputs: Record<string, unknown>;
  error?: string;
}

/**
 * How many finished-but-unwaited results to hold. Enough to cover the gap
 * between /prompt answering and the caller registering its waiter, small
 * enough that prompts submitted by other clients cannot accumulate.
 */
const MAX_UNCLAIMED_RESULTS = 32;

/**
 * Why an in-flight prompt was failed when this process stopped watching it.
 *
 * Every path that tears the socket down uses this one string, because
 * `jobs/reconcile.ts` keys off it to decide a job is worth re-checking
 * against ComfyUI's history. A second wording anywhere means those runs are
 * never reconciled: ComfyUI finishes the render and the job stays failed
 * forever. That is exactly what `disconnect()` did with its own message.
 */
export const DISCONNECT_MARKER =
  "ComfyUI disconnected before this execution finished";

export class ComfyUIWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private closedByUser = false;
  private pendingPrompts: Map<
    string,
    {
      resolve: (result: PromptResult) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  /**
   * Outputs seen for a prompt so far, waiter or not.
   *
   * These used to hang off the pending entry, so an `executed` message that
   * arrived before waitForPrompt was called was discarded.
   */
  private outputs: Map<string, Record<string, unknown>> = new Map();

  /**
   * Results that finished before anyone asked for them.
   *
   * A caller cannot register a waiter until /prompt has returned a prompt id,
   * and a fully cached prompt can execute and finish inside that window. The
   * terminal message then found no pending entry and was dropped, leaving a
   * promise that - by design - has no timeout, so the job sat in "working"
   * forever. Holding the result here closes that window.
   */
  private unclaimed: Map<string, PromptResult> = new Map();

  constructor(url: string) {
    super();
    this.url = url;
    // EventEmitter throws when an "error" event has no listener. This class
    // emits one for every failed socket, including from the setTimeout in
    // attemptReconnect() where nothing can catch it, so a ComfyUI restart
    // would take the whole MCP server process down with it.
    this.on("error", () => {});
  }

  connect(): Promise<void> {
    // An explicit connect() is a fresh start, so clear backoff state left over
    // from a previous outage. Without this, a socket whose reconnect ladder was
    // exhausted could never be revived.
    this.reconnectAttempts = 0;
    this.closedByUser = false;
    return this.openSocket();
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      // The returned promise must settle exactly once, on every path. The old
      // code only rejected while reconnectAttempts === 0, so after an outage
      // exhausted the ladder every later connect() hung forever and took the
      // calling tool with it.
      let settled = false;
      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      let socket: WebSocket;
      try {
        socket = new WebSocket(this.url);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.ws = socket;

      // Handlers from a socket we have already replaced must not drive
      // reconnects or fail prompts belonging to the current one.
      const isCurrent = () => this.ws === socket;

      socket.on("open", () => {
        if (!isCurrent()) return;
        this.reconnectAttempts = 0;
        this.emit("connected");
        succeed();
      });

      socket.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString()) as ComfyUIMessage;
          this.handleMessage(message);
        } catch {
          // Ignore parse errors for binary messages
        }
      });

      socket.on("close", () => {
        if (!isCurrent()) return;
        this.emit("disconnected");
        fail(new Error(`WebSocket to ${this.url} closed before it opened`));
        // ComfyUI went away mid-execution: the progress stream for anything in
        // flight is gone, so settle those waiters instead of leaking them.
        // reconnect() reconciles them against /history afterwards.
        this.failPendingPrompts(DISCONNECT_MARKER);
        if (!this.closedByUser) {
          this.attemptReconnect();
        }
      });

      socket.on("error", (error) => {
        if (!isCurrent()) return;
        this.emit("error", error);
        fail(error);
      });
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        if (this.closedByUser) return;
        this.openSocket().catch(() => {
          // Reconnect failed, will try again
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  private failPendingPrompts(reason: string): void {
    for (const [promptId, pending] of this.pendingPrompts) {
      pending.reject(new Error(reason));
      this.pendingPrompts.delete(promptId);
    }
    // Partial outputs from an execution we can no longer follow are not worth
    // keeping; reconcile() resolves those against /history instead.
    this.outputs.clear();
  }

  /** Accumulated outputs for a prompt, created on first sight. */
  private outputsFor(promptId: string): Record<string, unknown> {
    let outputs = this.outputs.get(promptId);
    if (!outputs) {
      outputs = {};
      this.outputs.set(promptId, outputs);
    }
    return outputs;
  }

  /**
   * Hand a finished prompt to its waiter, or hold it until one arrives.
   */
  private settle(result: PromptResult): void {
    this.outputs.delete(result.promptId);

    const pending = this.pendingPrompts.get(result.promptId);
    if (pending) {
      this.pendingPrompts.delete(result.promptId);
      pending.resolve(result);
      return;
    }

    this.unclaimed.set(result.promptId, result);
    // Bounded: a result nobody ever claims is a prompt submitted by another
    // client, and there is no upper limit on how many of those an instance
    // serves. Map iterates in insertion order, so this drops the oldest.
    while (this.unclaimed.size > MAX_UNCLAIMED_RESULTS) {
      const oldest = this.unclaimed.keys().next().value;
      if (oldest === undefined) break;
      this.unclaimed.delete(oldest);
    }
  }

  private handleMessage(message: ComfyUIMessage): void {
    this.emit("message", message);

    switch (message.type) {
      case "progress":
        this.emit("progress", message.data);
        break;

      case "executing":
        if (message.data.node === null) {
          // Execution complete
          this.settle({
            success: true,
            promptId: message.data.prompt_id,
            outputs: this.outputsFor(message.data.prompt_id),
          });
        } else {
          this.emit("executing", message.data);
        }
        break;

      case "executed":
        this.outputsFor(message.data.prompt_id)[message.data.node] = message.data.output;
        this.emit("executed", message.data);
        break;

      case "execution_start":
        this.emit("execution_start", message.data);
        break;

      case "execution_cached":
        this.emit("execution_cached", message.data);
        break;

      case "execution_error":
        this.settle({
          success: false,
          promptId: message.data.prompt_id,
          outputs: this.outputsFor(message.data.prompt_id),
          error: message.data.exception_message,
        });
        this.emit("execution_error", message.data);
        break;
    }
  }

  waitForPrompt(promptId: string): Promise<PromptResult> {
    // It may already have finished: see `unclaimed`. Checking first is what
    // makes registering late safe, which callers cannot avoid doing - the
    // prompt id only exists once /prompt has answered.
    const alreadyFinished = this.unclaimed.get(promptId);
    if (alreadyFinished) {
      this.unclaimed.delete(promptId);
      return Promise.resolve(alreadyFinished);
    }

    return new Promise((resolve, reject) => {
      // No timeout - let ComfyUI run as long as needed
      // Video generation and large models can take hours
      this.pendingPrompts.set(promptId, { resolve, reject });
    });
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      socket.close();
    }
    // Reject all pending prompts. A deliberate teardown is no more
    // authoritative than a dropped socket - ComfyUI carries on rendering
    // either way - so these carry the same marker and get reconciled.
    this.failPendingPrompts(DISCONNECT_MARKER);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
