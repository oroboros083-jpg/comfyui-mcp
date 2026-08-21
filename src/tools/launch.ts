import { z } from "zod";
import { spawn } from "child_process";
import { platform, homedir } from "os";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Starting ComfyUI is the one thing this server cannot do over HTTP: every
 * other tool talks to an instance that already exists. So this module is
 * deliberately the only place that touches child_process, and everything it
 * spawns is detached - ComfyUI must outlive the MCP server, not die with it.
 */

export interface LaunchTarget {
  kind: "desktop" | "portable" | "script" | "custom";
  /** Human-readable description of what will be launched. */
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  /**
   * Windows .bat/.cmd launchers cannot be spawned directly - Node refuses
   * them, so they go through cmd.exe.
   */
  useShell: boolean;
}

function isWindows(): boolean {
  return platform() === "win32";
}

function isRunningInDocker(): boolean {
  return existsSync("/.dockerenv") || process.env.DOCKER === "true";
}

function needsShell(command: string): boolean {
  return isWindows() && /\.(bat|cmd)$/i.test(command);
}

/**
 * Find the Python that belongs to a checkout, so a source install runs against
 * its own venv rather than whatever `python` happens to be on PATH.
 */
function resolvePython(dir: string): string {
  const candidates = isWindows()
    ? [
        join(dir, "venv", "Scripts", "python.exe"),
        join(dir, ".venv", "Scripts", "python.exe"),
        // Portable layout: python_embeded sits beside the ComfyUI folder.
        join(dir, "..", "python_embeded", "python.exe"),
      ]
    : [join(dir, "venv", "bin", "python"), join(dir, ".venv", "bin", "python")];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return isWindows() ? "python" : "python3";
}

function scriptTarget(dir: string): LaunchTarget | null {
  const main = join(dir, "main.py");
  if (!existsSync(main)) return null;

  return {
    kind: "script",
    label: `ComfyUI source install at ${dir}`,
    command: resolvePython(dir),
    args: [main],
    cwd: dir,
    useShell: false,
  };
}

/**
 * Every way we know to start ComfyUI on this machine, best first. Desktop app
 * before portable before source, because that is the order of "least likely to
 * need arguments the user has in their head but we do not".
 */
export function detectLaunchTargets(): LaunchTarget[] {
  const os = platform();
  const home = homedir();
  const targets: LaunchTarget[] = [];

  if (os === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || join(home, "AppData", "Local");

    const desktopExes = [
      join(localAppData, "Programs", "ComfyUI", "ComfyUI.exe"),
      join(localAppData, "Programs", "@comfyorgcomfyui-electron", "ComfyUI.exe"),
      "C:\\Program Files\\ComfyUI\\ComfyUI.exe",
    ];

    for (const exe of desktopExes) {
      if (existsSync(exe)) {
        targets.push({
          kind: "desktop",
          label: `ComfyUI desktop app at ${exe}`,
          command: exe,
          args: [],
          useShell: false,
        });
      }
    }

    const roots = [
      "C:\\ComfyUI",
      "C:\\ComfyUI_windows_portable",
      join(home, "ComfyUI"),
      join(home, "ComfyUI_windows_portable"),
      join(home, "Documents", "ComfyUI"),
      join(home, "Downloads", "ComfyUI_windows_portable"),
    ];

    for (const root of roots) {
      for (const bat of ["run_nvidia_gpu.bat", "run_cpu.bat"]) {
        const script = join(root, bat);
        if (existsSync(script)) {
          targets.push({
            kind: "portable",
            label: `ComfyUI portable launcher ${script}`,
            command: script,
            args: [],
            cwd: root,
            useShell: true,
          });
        }
      }

      for (const dir of [root, join(root, "ComfyUI")]) {
        const target = scriptTarget(dir);
        if (target) targets.push(target);
      }
    }
  } else if (os === "darwin") {
    const apps = [
      "/Applications/ComfyUI.app",
      join(home, "Applications", "ComfyUI.app"),
    ];

    for (const app of apps) {
      if (existsSync(app)) {
        targets.push({
          kind: "desktop",
          label: `ComfyUI desktop app at ${app}`,
          command: "open",
          args: ["-a", app],
          useShell: false,
        });
      }
    }

    for (const dir of [
      join(home, "ComfyUI"),
      join(home, "comfyui"),
      join(home, "Documents", "ComfyUI"),
    ]) {
      const target = scriptTarget(dir);
      if (target) targets.push(target);
    }
  } else {
    const launchers = [
      join(home, "Applications", "ComfyUI.AppImage"),
      "/usr/local/bin/comfyui",
      "/usr/bin/comfyui",
    ];

    for (const app of launchers) {
      if (existsSync(app)) {
        targets.push({
          kind: "desktop",
          label: `ComfyUI launcher at ${app}`,
          command: app,
          args: [],
          useShell: false,
        });
      }
    }

    for (const dir of [
      join(home, "ComfyUI"),
      join(home, "comfyui"),
      "/opt/ComfyUI",
    ]) {
      const target = scriptTarget(dir);
      if (target) targets.push(target);
    }
  }

  return targets;
}

/**
 * A launch command configured by the user, which always beats detection -
 * anyone with a wrapper script or non-standard flags sets this once instead of
 * passing it on every call.
 */
function envLaunchTarget(): LaunchTarget | null {
  const command = process.env.COMFYUI_LAUNCH_COMMAND;
  if (!command) return null;

  const raw = process.env.COMFYUI_LAUNCH_ARGS;
  return {
    kind: "custom",
    label: `COMFYUI_LAUNCH_COMMAND (${command})`,
    command,
    args: raw ? raw.split(" ").filter(Boolean) : [],
    cwd: process.env.COMFYUI_LAUNCH_CWD || undefined,
    useShell: needsShell(command),
  };
}

export const startComfyUISchema = z.object({
  command: z
    .string()
    .optional()
    .describe(
      "Executable, .bat, or script to launch instead of the auto-detected one. An absolute path, or a name on PATH."
    ),
  args: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Arguments for the command, e.g. ['--listen', '--port', '8189']."),
  cwd: z
    .string()
    .optional()
    .describe(
      "Working directory to launch from. Defaults to the detected install directory."
    ),
  timeoutSeconds: z
    .number()
    .int()
    .min(10)
    .max(600)
    .optional()
    .default(180)
    .describe(
      "How long to wait for ComfyUI to start answering before reporting failure. A cold start that loads many custom nodes can take minutes."
    ),
});

export type StartComfyUIInput = z.infer<typeof startComfyUISchema>;

/**
 * Pick what to launch: explicit argument, then configured command, then
 * whatever was found on disk.
 */
export function resolveLaunchTarget(input: StartComfyUIInput): {
  target: LaunchTarget | null;
  detected: LaunchTarget[];
} {
  const detected = detectLaunchTargets();

  if (input.command) {
    return {
      target: {
        kind: "custom",
        label: `command supplied by caller (${input.command})`,
        command: input.command,
        args: input.args,
        cwd: input.cwd,
        useShell: needsShell(input.command),
      },
      detected,
    };
  }

  const fromEnv = envLaunchTarget();
  if (fromEnv) {
    return { target: { ...fromEnv, cwd: input.cwd ?? fromEnv.cwd }, detected };
  }

  const first = detected[0];
  return {
    target: first ? { ...first, cwd: input.cwd ?? first.cwd } : null,
    detected,
  };
}

export interface LaunchResult {
  pid?: number;
  /** Reports how the process died, if it died before we stopped waiting. */
  exited: () => { code: number | null; signal: string | null } | null;
}

/**
 * Spawn the target detached, with stdio discarded. Both matter: inheriting
 * stdout would corrupt the MCP protocol stream, and staying attached would
 * take ComfyUI down with this server.
 */
export async function spawnComfyUI(target: LaunchTarget): Promise<LaunchResult> {
  const quote = (value: string) => '"' + value.replace(/"/g, '\\"') + '"';

  const child = target.useShell
    ? spawn([target.command, ...target.args].map(quote).join(" "), [], {
        cwd: target.cwd,
        detached: true,
        stdio: "ignore",
        shell: true,
      })
    : spawn(target.command, target.args, {
        cwd: target.cwd,
        detached: true,
        stdio: "ignore",
      });

  // A launcher that dies immediately (missing Python, bad flag) otherwise looks
  // exactly like one that is slow to boot. Keep the exit around so the timeout
  // path can tell them apart.
  let exit: { code: number | null; signal: string | null } | null = null;
  child.on("exit", (code, signal) => {
    exit = { code, signal };
  });

  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });

  child.unref();

  return { pid: child.pid, exited: () => exit };
}

/**
 * Whether a URL points at this machine. Launching a local process cannot help
 * a ComfyUI that lives somewhere else.
 */
export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Why this machine cannot be the one to start ComfyUI, if it cannot.
 */
export function launchBlockedReason(url: string): string | null {
  if (isRunningInDocker()) {
    return (
      "This MCP server is running inside Docker, so it cannot start ComfyUI on the host. " +
      "Start ComfyUI outside the container and call 'reconnect'."
    );
  }

  if (!isLocalUrl(url)) {
    return (
      `ComfyUI is configured at ${url}, which is not this machine. ` +
      "Start it on that host and call 'reconnect'."
    );
  }

  return null;
}
