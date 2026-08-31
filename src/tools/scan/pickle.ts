/**
 * Walking a pickle stream without executing it.
 *
 * `torch.load` on a `.ckpt` or `.pt` unpickles, and unpickling is by design a
 * small interpreter: `GLOBAL` imports any callable the stream names and
 * `REDUCE` calls it. That is not a bug being exploited, it is what the format
 * does - which is why `.safetensors` exists, and why the only safe way to ask
 * "what would this file do" is to read the opcodes rather than run them.
 *
 * So this reads the byte stream directly. The one thing it must get right is
 * argument LENGTHS: every opcode's argument has to be skipped exactly, because
 * one wrong length desynchronises the reader and everything after it is
 * garbage - and garbage that happens to contain no dangerous name reads as a
 * clean file. That is the failure mode to design against, so an unknown opcode
 * stops the walk and says so rather than guessing a width.
 *
 * WHAT IT CANNOT DO. It does not simulate the stack, so `STACK_GLOBAL` - which
 * takes its module and name from two values pushed earlier - is resolved by
 * taking the two most recent string constants, honouring the memo. That is
 * right for everything a real toolchain emits and for the published exploits,
 * but a crafted stream can reorder pushes to make the attribution wrong. It is
 * why `constants` is reported alongside `imports` and why the caller matches
 * signatures against BOTH: an attacker can break the pairing, but the strings
 * `posix` and `system` still have to appear somewhere in the stream.
 */

/** A callable the stream names, i.e. something unpickling would import. */
export interface PickleImport {
  module: string;
  name: string;
  /** How it was named: a plain GLOBAL, or assembled on the stack. */
  via: "GLOBAL" | "STACK_GLOBAL" | "INST";
}

export interface PickleScan {
  imports: PickleImport[];
  /** Every string constant in the stream, deduplicated. */
  constants: string[];
  /** Opcodes that actually invoke something the stream imported. */
  calls: number;
  /** Set when the walk stopped early; `stoppedBecause` says why. */
  truncated: boolean;
  stoppedBecause?: string;
  /** Protocol from the PROTO opcode, when the stream declares one. */
  protocol?: number;
}

/** Beyond this many opcodes, the stream is not a checkpoint header. */
const MAX_OPCODES = 2_000_000;
/** Constants longer than this are data, not module names. */
const MAX_CONSTANT_LENGTH = 512;
/** Distinct constants worth keeping; a real checkpoint names thousands of tensors. */
const MAX_CONSTANTS = 5_000;

/**
 * How many bytes of argument each opcode carries, or how to find out.
 *
 * `fixed` is a byte count. `line` reads to the next newline (protocol 0's text
 * arguments). `linePair` is two of those - GLOBAL and INST both name a module
 * and a callable that way. `sized` reads an N-byte little-endian length and
 * then that many bytes.
 */
type ArgumentKind =
  | { kind: "none" }
  | { kind: "fixed"; bytes: number }
  | { kind: "line" }
  | { kind: "linePair" }
  | { kind: "sized"; lengthBytes: number; text: boolean };

const NONE: ArgumentKind = { kind: "none" };
const fixed = (bytes: number): ArgumentKind => ({ kind: "fixed", bytes });
const sized = (lengthBytes: number, text: boolean): ArgumentKind => ({
  kind: "sized",
  lengthBytes,
  text,
});
const LINE: ArgumentKind = { kind: "line" };
const LINE_PAIR: ArgumentKind = { kind: "linePair" };

/**
 * The opcode table, protocols 0 through 5.
 *
 * Written out in full rather than defaulting the unknown ones to zero-width:
 * a missing entry has to be an error, because guessing "no argument" for an
 * opcode that has one is precisely the desync described above.
 */
const OPCODES: Record<number, { name: string; arg: ArgumentKind }> = {
  // Protocol 0
  0x28: { name: "MARK", arg: NONE },
  0x2e: { name: "STOP", arg: NONE },
  0x30: { name: "POP", arg: NONE },
  0x31: { name: "POP_MARK", arg: NONE },
  0x32: { name: "DUP", arg: NONE },
  0x46: { name: "FLOAT", arg: LINE },
  0x49: { name: "INT", arg: LINE },
  0x4a: { name: "BININT", arg: fixed(4) },
  0x4b: { name: "BININT1", arg: fixed(1) },
  0x4c: { name: "LONG", arg: LINE },
  0x4d: { name: "BININT2", arg: fixed(2) },
  0x4e: { name: "NONE", arg: NONE },
  0x50: { name: "PERSID", arg: LINE },
  0x51: { name: "BINPERSID", arg: NONE },
  0x52: { name: "REDUCE", arg: NONE },
  0x53: { name: "STRING", arg: LINE },
  0x54: { name: "BINSTRING", arg: sized(4, true) },
  0x55: { name: "SHORT_BINSTRING", arg: sized(1, true) },
  0x56: { name: "UNICODE", arg: LINE },
  0x58: { name: "BINUNICODE", arg: sized(4, true) },
  0x61: { name: "APPEND", arg: NONE },
  0x62: { name: "BUILD", arg: NONE },
  0x63: { name: "GLOBAL", arg: LINE_PAIR },
  0x64: { name: "DICT", arg: NONE },
  0x65: { name: "APPENDS", arg: NONE },
  0x67: { name: "GET", arg: LINE },
  0x68: { name: "BINGET", arg: fixed(1) },
  0x69: { name: "INST", arg: LINE_PAIR },
  0x6a: { name: "LONG_BINGET", arg: fixed(4) },
  0x6c: { name: "LIST", arg: NONE },
  0x6f: { name: "OBJ", arg: NONE },
  0x70: { name: "PUT", arg: LINE },
  0x71: { name: "BINPUT", arg: fixed(1) },
  0x72: { name: "LONG_BINPUT", arg: fixed(4) },
  0x73: { name: "SETITEM", arg: NONE },
  0x74: { name: "TUPLE", arg: NONE },
  0x75: { name: "SETITEMS", arg: NONE },
  0x47: { name: "BINFLOAT", arg: fixed(8) },
  0x5d: { name: "EMPTY_LIST", arg: NONE },
  0x7d: { name: "EMPTY_DICT", arg: NONE },
  0x29: { name: "EMPTY_TUPLE", arg: NONE },

  // Protocol 2
  0x80: { name: "PROTO", arg: fixed(1) },
  0x81: { name: "NEWOBJ", arg: NONE },
  0x82: { name: "EXT1", arg: fixed(1) },
  0x83: { name: "EXT2", arg: fixed(2) },
  0x84: { name: "EXT4", arg: fixed(4) },
  0x85: { name: "TUPLE1", arg: NONE },
  0x86: { name: "TUPLE2", arg: NONE },
  0x87: { name: "TUPLE3", arg: NONE },
  0x88: { name: "NEWTRUE", arg: NONE },
  0x89: { name: "NEWFALSE", arg: NONE },
  0x8a: { name: "LONG1", arg: sized(1, false) },
  0x8b: { name: "LONG4", arg: sized(4, false) },

  // Protocol 3
  0x42: { name: "BINBYTES", arg: sized(4, false) },
  0x43: { name: "SHORT_BINBYTES", arg: sized(1, false) },

  // Protocol 4
  0x8c: { name: "SHORT_BINUNICODE", arg: sized(1, true) },
  0x8d: { name: "BINUNICODE8", arg: sized(8, true) },
  0x8e: { name: "BINBYTES8", arg: sized(8, false) },
  0x8f: { name: "EMPTY_SET", arg: NONE },
  0x90: { name: "FROZENSET", arg: NONE },
  0x91: { name: "ADDITEMS", arg: NONE },
  0x92: { name: "NEWOBJ_EX", arg: NONE },
  0x93: { name: "STACK_GLOBAL", arg: NONE },
  0x94: { name: "MEMOIZE", arg: NONE },
  0x95: { name: "FRAME", arg: fixed(8) },

  // Protocol 5
  0x96: { name: "BYTEARRAY8", arg: sized(8, false) },
  0x97: { name: "NEXT_BUFFER", arg: NONE },
  0x98: { name: "READONLY_BUFFER", arg: NONE },
};

/** Opcodes that call something: this is where an import stops being inert. */
const CALL_OPCODES = new Set(["REDUCE", "INST", "OBJ", "NEWOBJ", "NEWOBJ_EX", "BUILD"]);

/**
 * Does this stream start with something that could be a pickle?
 *
 * Only worth asking to avoid reporting "unparseable pickle" for a file that
 * was never one. A protocol 2+ stream opens with PROTO; protocol 0 and 1 open
 * with whatever their first value is, so this stays permissive.
 */
export function looksLikePickle(head: Buffer): boolean {
  if (head.length === 0) return false;
  const first = head[0]!;
  if (first === 0x80) return true;
  return OPCODES[first] !== undefined;
}

export function scanPickle(data: Buffer): PickleScan {
  const imports: PickleImport[] = [];
  const constants: string[] = [];
  const seenConstants = new Set<string>();
  // Only string values are tracked, and only so STACK_GLOBAL has something to
  // resolve against. See the caveat at the top of the file.
  const stringStack: string[] = [];
  const memo = new Map<number, string>();
  let memoCounter = 0;
  let calls = 0;
  let protocol: number | undefined;
  let truncated = false;
  let stoppedBecause: string | undefined;

  const remember = (value: string) => {
    if (value.length > MAX_CONSTANT_LENGTH) return;
    stringStack.push(value);
    if (stringStack.length > 64) stringStack.shift();
    if (!seenConstants.has(value) && constants.length < MAX_CONSTANTS) {
      seenConstants.add(value);
      constants.push(value);
    }
  };

  let cursor = 0;
  let opcodeCount = 0;

  const stop = (why: string): PickleScan => {
    truncated = true;
    stoppedBecause = why;
    return { imports, constants, calls, truncated, stoppedBecause, protocol };
  };

  while (cursor < data.length) {
    if (++opcodeCount > MAX_OPCODES) return stop(`more than ${MAX_OPCODES} opcodes`);

    const byte = data[cursor]!;
    const op = OPCODES[byte];
    if (!op) {
      return stop(
        `unknown opcode 0x${byte.toString(16).padStart(2, "0")} at byte ${cursor}`
      );
    }
    cursor += 1;

    switch (op.arg.kind) {
      case "none":
        break;

      case "fixed": {
        const start = cursor;
        cursor += op.arg.bytes;
        if (cursor > data.length) return stop(`truncated ${op.name} argument`);
        if (op.name === "PROTO") protocol = data[start]!;
        // A memo read pushes back whatever was stored, which is how an
        // obfuscated stream separates the strings from the STACK_GLOBAL
        // that consumes them.
        if (op.name === "BINGET" || op.name === "LONG_BINGET") {
          const key = op.arg.bytes === 1 ? data[start]! : data.readUInt32LE(start);
          const stored = memo.get(key);
          if (stored !== undefined) stringStack.push(stored);
        }
        if (op.name === "BINPUT" || op.name === "LONG_BINPUT") {
          const key = op.arg.bytes === 1 ? data[start]! : data.readUInt32LE(start);
          const top = stringStack[stringStack.length - 1];
          if (top !== undefined) memo.set(key, top);
          memoCounter = Math.max(memoCounter, key + 1);
        }
        break;
      }

      case "line": {
        const end = data.indexOf(0x0a, cursor);
        if (end < 0) return stop(`unterminated ${op.name} argument`);
        const value = data.subarray(cursor, end).toString("latin1");
        cursor = end + 1;
        if (op.name === "STRING" || op.name === "UNICODE") {
          // Protocol 0 quotes STRING values; the quotes are not part of it.
          remember(value.replace(/^['"]|['"]$/g, ""));
        }
        if (op.name === "PUT") {
          const key = Number(value);
          const top = stringStack[stringStack.length - 1];
          if (Number.isInteger(key) && top !== undefined) memo.set(key, top);
        }
        if (op.name === "GET") {
          const stored = memo.get(Number(value));
          if (stored !== undefined) stringStack.push(stored);
        }
        break;
      }

      case "linePair": {
        const moduleEnd = data.indexOf(0x0a, cursor);
        if (moduleEnd < 0) return stop(`unterminated ${op.name} module`);
        const nameEnd = data.indexOf(0x0a, moduleEnd + 1);
        if (nameEnd < 0) return stop(`unterminated ${op.name} name`);

        const module = data.subarray(cursor, moduleEnd).toString("latin1");
        const name = data.subarray(moduleEnd + 1, nameEnd).toString("latin1");
        cursor = nameEnd + 1;

        imports.push({ module, name, via: op.name === "INST" ? "INST" : "GLOBAL" });
        remember(module);
        remember(name);
        if (op.name === "INST") calls++;
        break;
      }

      case "sized": {
        const { lengthBytes, text } = op.arg;
        if (cursor + lengthBytes > data.length) return stop(`truncated ${op.name} length`);
        const length =
          lengthBytes === 1
            ? data[cursor]!
            : lengthBytes === 2
              ? data.readUInt16LE(cursor)
              : lengthBytes === 4
                ? data.readUInt32LE(cursor)
                : Number(data.readBigUInt64LE(cursor));
        cursor += lengthBytes;

        const end = cursor + length;
        if (end > data.length || end < cursor) return stop(`truncated ${op.name} payload`);
        if (text && length <= MAX_CONSTANT_LENGTH) {
          remember(data.subarray(cursor, end).toString("utf-8"));
        }
        cursor = end;
        break;
      }
    }

    if (op.name === "MEMOIZE") {
      const top = stringStack[stringStack.length - 1];
      if (top !== undefined) memo.set(memoCounter, top);
      memoCounter++;
    }

    if (op.name === "STACK_GLOBAL") {
      // Pushed module first, then name, so the name is on top.
      const name = stringStack.pop();
      const module = stringStack.pop();
      imports.push({
        module: module ?? "<unresolved>",
        name: name ?? "<unresolved>",
        via: "STACK_GLOBAL",
      });
    }

    if (CALL_OPCODES.has(op.name) && op.name !== "INST") calls++;

    if (op.name === "STOP") break;
  }

  return { imports, constants, calls, truncated, stoppedBecause, protocol };
}
