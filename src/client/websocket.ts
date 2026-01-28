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

export class ComfyUIWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingPrompts: Map<
    string,
    {
      resolve: (result: PromptResult) => void;
      reject: (error: Error) => void;
      outputs: Record<string, unknown>;
    }
  > = new Map();

  constructor(url: string) {
    super();
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on("open", () => {
          this.reconnectAttempts = 0;
          this.emit("connected");
          resolve();
        });

        this.ws.on("message", (data) => {
          try {
            const message = JSON.parse(data.toString()) as ComfyUIMessage;
            this.handleMessage(message);
          } catch {
            // Ignore parse errors for binary messages
          }
        });

        this.ws.on("close", () => {
          this.emit("disconnected");
          this.attemptReconnect();
        });

        this.ws.on("error", (error) => {
          this.emit("error", error);
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch(() => {
          // Reconnect failed, will try again
        });
      }, this.reconnectDelay * this.reconnectAttempts);
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
          const pending = this.pendingPrompts.get(message.data.prompt_id);
          if (pending) {
            pending.resolve({
              success: true,
              promptId: message.data.prompt_id,
              outputs: pending.outputs,
            });
            this.pendingPrompts.delete(message.data.prompt_id);
          }
        } else {
          this.emit("executing", message.data);
        }
        break;

      case "executed":
        const pending = this.pendingPrompts.get(message.data.prompt_id);
        if (pending) {
          pending.outputs[message.data.node] = message.data.output;
        }
        this.emit("executed", message.data);
        break;

      case "execution_start":
        this.emit("execution_start", message.data);
        break;

      case "execution_cached":
        this.emit("execution_cached", message.data);
        break;

      case "execution_error":
        const errorPending = this.pendingPrompts.get(message.data.prompt_id);
        if (errorPending) {
          errorPending.resolve({
            success: false,
            promptId: message.data.prompt_id,
            outputs: errorPending.outputs,
            error: message.data.exception_message,
          });
          this.pendingPrompts.delete(message.data.prompt_id);
        }
        this.emit("execution_error", message.data);
        break;
    }
  }

  waitForPrompt(promptId: string): Promise<PromptResult> {
    return new Promise((resolve, reject) => {
      // No timeout - let ComfyUI run as long as needed
      // Video generation and large models can take hours
      this.pendingPrompts.set(promptId, {
        resolve,
        reject,
        outputs: {},
      });
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // Reject all pending prompts
    for (const [promptId, pending] of this.pendingPrompts) {
      pending.reject(new Error("WebSocket disconnected"));
      this.pendingPrompts.delete(promptId);
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
