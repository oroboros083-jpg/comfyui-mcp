/**
 * What a pickle is allowed to import, and what it very much is not.
 *
 * Three lists, and the split between them is the whole judgement this scanner
 * makes:
 *
 *  - DANGEROUS: importing it is arbitrary code execution or worse. There is no
 *    legitimate reason for a model checkpoint to name `posix.system`.
 *  - SUSPICIOUS: legitimate somewhere, but not in a tensor file - `functools`,
 *    `operator`, `pickle` itself. Every published pickle exploit assembles its
 *    call out of these, so their presence is worth reporting even though it is
 *    not proof.
 *  - EXPECTED: what `torch.save` and numpy actually emit. Listed so the report
 *    can say "and 40 ordinary ones" instead of printing them.
 *
 * The lists are matched two ways - against resolved module.name pairs, and
 * against the raw string constants in the stream - because `STACK_GLOBAL`
 * pairing can be broken deliberately but the strings still have to be present.
 * That is also why a module can be listed with no names: for `subprocess`
 * there is no safe member, so naming the module at all is the finding.
 */

/** A module whose every member is dangerous, or specific members of one. */
export interface Signature {
  module: string;
  /** Omit to mean "any member of this module". */
  names?: string[];
  reason: string;
}

/**
 * Arbitrary execution, filesystem destruction, or network egress.
 *
 * Drawn from the members that published pickle exploits actually reach for.
 * `builtins.getattr` is here rather than under suspicion because it is the
 * standard way to walk from an allowed object to a forbidden one, which makes
 * it execution by another route.
 */
export const DANGEROUS: Signature[] = [
  {
    module: "os",
    reason: "runs commands, spawns processes and deletes files",
  },
  { module: "posix", reason: "the POSIX half of `os`: runs commands and deletes files" },
  { module: "nt", reason: "the Windows half of `os`: runs commands and deletes files" },
  { module: "subprocess", reason: "runs external programs" },
  { module: "commands", reason: "runs shell commands (Python 2 `commands`)" },
  { module: "pty", names: ["spawn", "fork", "openpty"], reason: "spawns an interactive shell" },
  { module: "socket", reason: "opens a network connection" },
  { module: "ctypes", reason: "calls into native code, bypassing every Python-level check" },
  { module: "shutil", reason: "moves and deletes directory trees" },
  { module: "runpy", reason: "executes a module or a path as a program" },
  { module: "importlib", reason: "imports arbitrary modules by name at load time" },
  { module: "pdb", reason: "drops into the debugger, which evaluates arbitrary input" },
  { module: "bdb", reason: "debugger internals, reachable as an execution primitive" },
  { module: "webbrowser", reason: "launches an external program" },
  { module: "venv", reason: "creates environments by running the interpreter" },
  { module: "timeit", names: ["timeit"], reason: "compiles and runs a string of code" },
  { module: "code", reason: "compiles and runs source at load time" },
  { module: "codeop", reason: "compiles source at load time" },
  { module: "asyncio", names: ["create_subprocess_exec", "create_subprocess_shell"], reason: "runs external programs" },
  { module: "multiprocessing", reason: "spawns processes" },
  { module: "aiohttp", reason: "makes network requests" },
  { module: "requests", reason: "makes network requests" },
  { module: "urllib", reason: "makes network requests" },
  { module: "urllib2", reason: "makes network requests" },
  { module: "urllib3", reason: "makes network requests" },
  { module: "httpx", reason: "makes network requests" },
  { module: "http", reason: "makes network requests" },
  { module: "ftplib", reason: "makes network connections" },
  { module: "telnetlib", reason: "makes network connections" },
  { module: "smtplib", reason: "sends mail" },
  { module: "paramiko", reason: "opens SSH connections" },
  { module: "torch", names: ["load"], reason: "unpickles a second file from inside this one" },
  { module: "torch.serialization", names: ["load"], reason: "unpickles a second file from inside this one" },
  {
    module: "builtins",
    names: [
      "eval",
      "exec",
      "execfile",
      "compile",
      "open",
      "input",
      "__import__",
      "getattr",
      "setattr",
      "delattr",
      "apply",
      "breakpoint",
      "globals",
      "locals",
      "vars",
      "memoryview",
    ],
    reason: "evaluates code, opens files, or reaches attributes the pickle is not allowed to name",
  },
  {
    module: "__builtin__",
    names: [
      "eval",
      "exec",
      "execfile",
      "compile",
      "open",
      "input",
      "__import__",
      "getattr",
      "setattr",
      "apply",
    ],
    reason: "the Python 2 spelling of the same execution primitives",
  },
  { module: "sys", names: ["modules", "exit", "argv", "path", "settrace", "setprofile"], reason: "reaches into the interpreter's own state" },
];

/**
 * Not damaging by itself, but not what a tensor file needs either.
 *
 * These are the glue an exploit is built from: `functools.partial` to bind
 * arguments, `operator.attrgetter` to walk to something forbidden,
 * `pickle.loads` to hide a second stream inside this one.
 */
export const SUSPICIOUS: Signature[] = [
  { module: "functools", reason: "binds arguments to a call - the usual way an exploit assembles one" },
  { module: "operator", reason: "attrgetter and methodcaller reach attributes and invoke them" },
  { module: "pickle", reason: "unpickles a nested stream, hiding what it does from a shallow read" },
  { module: "_pickle", reason: "unpickles a nested stream, hiding what it does from a shallow read" },
  { module: "base64", reason: "decodes a payload, usually because it is meant not to be read" },
  { module: "codecs", names: ["decode", "encode", "open"], reason: "decodes a payload or opens a file" },
  { module: "zlib", reason: "decompresses a payload, usually one meant not to be read" },
  { module: "bz2", reason: "decompresses a payload, usually one meant not to be read" },
  { module: "lzma", reason: "decompresses a payload, usually one meant not to be read" },
  { module: "marshal", reason: "loads compiled code objects" },
  { module: "types", names: ["FunctionType", "CodeType", "MethodType"], reason: "builds a callable out of raw code" },
  { module: "tempfile", reason: "creates files on disk" },
  { module: "pathlib", reason: "touches the filesystem" },
  { module: "shlex", reason: "prepares a command line" },
  { module: "platform", names: ["popen", "system"], reason: "runs commands through the platform module" },
  { module: "getpass", reason: "reads the current user, commonly used to fingerprint the machine" },
  { module: "pip", reason: "installs packages at load time" },
  { module: "setuptools", reason: "runs setup code" },
];

/**
 * The ordinary contents of a checkpoint.
 *
 * `_codecs.encode` is here despite `codecs` being suspicious above: torch
 * writes it for every non-ASCII string it stores, so flagging it would put a
 * finding on essentially every real checkpoint - and a scanner that cries wolf
 * on every file teaches its user to ignore it.
 */
export const EXPECTED: Signature[] = [
  { module: "torch", reason: "" },
  { module: "torch._utils", reason: "" },
  { module: "torch.nn", reason: "" },
  { module: "torch.nn.modules", reason: "" },
  { module: "torch.storage", reason: "" },
  { module: "torch._tensor", reason: "" },
  { module: "torch.jit", reason: "" },
  { module: "collections", reason: "" },
  { module: "numpy", reason: "" },
  { module: "numpy.core.multiarray", reason: "" },
  { module: "numpy._core.multiarray", reason: "" },
  { module: "_codecs", names: ["encode"], reason: "" },
  { module: "argparse", names: ["Namespace"], reason: "" },
  { module: "omegaconf", reason: "" },
  { module: "pytorch_lightning", reason: "" },
];

function matches(signature: Signature, module: string, name: string): boolean {
  // Submodule too: `torch.nn.modules.conv` is covered by `torch.nn`, and
  // `os.path` by `os`.
  const moduleMatches =
    module === signature.module || module.startsWith(`${signature.module}.`);
  if (!moduleMatches) return false;
  return signature.names === undefined || signature.names.includes(name);
}

export type Severity = "dangerous" | "suspicious";

/** The worst thing this import is, if it is anything. */
export function classifyImport(
  module: string,
  name: string
): { severity: Severity; reason: string } | null {
  // Expected wins over suspicious but NOT over dangerous: `torch` is expected,
  // `torch.load` is still a nested unpickle.
  for (const signature of DANGEROUS) {
    if (matches(signature, module, name)) {
      return { severity: "dangerous", reason: signature.reason };
    }
  }
  for (const signature of EXPECTED) {
    if (matches(signature, module, name)) return null;
  }
  for (const signature of SUSPICIOUS) {
    if (matches(signature, module, name)) {
      return { severity: "suspicious", reason: signature.reason };
    }
  }
  return null;
}

/** One dangerous name found in the constants with no import to explain it. */
export interface DanglingConstant {
  /** "subprocess", or "builtins.eval" where a module and member were paired. */
  target: string;
  reason: string;
}

const DANGLING_REASON =
  "A pickle that assembles its imports on the stack to hide them is doing so on purpose";

/**
 * Dangerous names appearing as bare string constants.
 *
 * The backstop for a stream that has broken STACK_GLOBAL's pairing on purpose:
 * whatever order the pushes are in, the names still have to be in the file as
 * strings. Matching is against exact constants only - a substring test over
 * tensor names would fire constantly.
 *
 * Two rules, and the second exists because the first excluded every signature
 * carrying `names`, which is where `builtins.eval` lives - the commonest
 * primitive of the lot, and the one this backstop most needs to see:
 *
 *  - a whole-module signature (`subprocess`, `socket`) fires on the module
 *    name alone. There is no safe member, so naming it at all is the finding.
 *  - a signature with names fires only when the module AND one of its
 *    dangerous members are both present as constants.
 *
 * The pairing is what keeps the second rule quiet. On its own, "eval" is a
 * plausible string in a checkpoint's training config - `{"mode": "eval"}` -
 * and a false positive here is worse than a miss, because a scanner that
 * flags ordinary files teaches its reader to skip the findings. "builtins"
 * and "eval" as two separate constants in one file with no resolvable import
 * between them is not something an honest checkpoint writes.
 */
export function danglingDangerousConstants(constants: string[]): DanglingConstant[] {
  const present = new Set(constants);
  const found: DanglingConstant[] = [];

  for (const signature of DANGEROUS) {
    if (!present.has(signature.module)) continue;

    if (signature.names === undefined) {
      found.push({
        target: signature.module,
        reason:
          `the name '${signature.module}' appears as a string constant without a resolvable ` +
          `import. ${DANGLING_REASON}`,
      });
      continue;
    }

    for (const name of signature.names) {
      if (!present.has(name)) continue;
      found.push({
        target: `${signature.module}.${name}`,
        reason:
          `'${signature.module}' and '${name}' both appear as string constants with no ` +
          `resolvable import pairing them. ${DANGLING_REASON}`,
      });
    }
  }

  return found;
}
