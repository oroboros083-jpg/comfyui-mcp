/**
 * Reading one named entry out of a ZIP archive, without unpacking it.
 *
 * This exists for exactly one caller: `torch.save` has written a ZIP since
 * PyTorch 1.6, and the pickle that decides whether a checkpoint is safe to
 * load is a single small member of it (`<prefix>/data.pkl`) sitting beside
 * gigabytes of tensor storage. Streaming the whole archive to reach it would
 * mean reading the whole checkpoint.
 *
 * So the read goes the other way round: the central directory is at the END
 * of a ZIP, which is what makes a targeted read possible at all. Find the
 * end-of-central-directory record, walk the directory for the entry wanted,
 * seek to its local header, and read only that member's bytes.
 *
 * Deliberately partial. It handles what `torch.save` and `zipfile` actually
 * emit - stored and deflated members, and ZIP64 for the >4GB archives a large
 * checkpoint really does produce - and refuses anything else rather than
 * guessing. It is not a general unzip and should not grow into one.
 */

import { FileHandle } from "fs/promises";
import { inflateRawSync } from "zlib";

const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;
const EOCD64_SIGNATURE = 0x06064b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

const EOCD_MIN_SIZE = 22;
/** A ZIP comment is a 16-bit length, so the EOCD is never further back. */
const MAX_COMMENT_SIZE = 0xffff;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** ZIP32 stores "unknown/too large" as an all-ones field; ZIP64 carries the real one. */
const OVERFLOW32 = 0xffffffff;
const OVERFLOW16 = 0xffff;

export class ZipReadError extends Error {}

export interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

async function readAt(handle: FileHandle, offset: number, length: number): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0);
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, offset);
  return buffer.subarray(0, bytesRead);
}

/** Is this a ZIP at all? Cheap enough to ask before doing any of the above. */
export function looksLikeZip(head: Buffer): boolean {
  return head.length >= 4 && head.readUInt32LE(0) === LOCAL_HEADER_SIGNATURE;
}

/**
 * Locate the end-of-central-directory record.
 *
 * Scanned backwards rather than forwards because a stored member's bytes can
 * contain the EOCD signature by coincidence - tensor data is arbitrary bytes -
 * and the real record is the last one.
 */
function findEocd(tail: Buffer): number {
  for (let i = tail.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

interface CentralDirectoryLocation {
  offset: number;
  size: number;
  entries: number;
}

/**
 * Where the central directory is, following the ZIP64 records when the ZIP32
 * fields have overflowed.
 */
async function locateCentralDirectory(
  handle: FileHandle,
  fileSize: number
): Promise<CentralDirectoryLocation> {
  const tailLength = Math.min(fileSize, EOCD_MIN_SIZE + MAX_COMMENT_SIZE);
  const tailStart = fileSize - tailLength;
  const tail = await readAt(handle, tailStart, tailLength);

  const eocdAt = findEocd(tail);
  if (eocdAt < 0) {
    throw new ZipReadError("No end-of-central-directory record: not a ZIP archive");
  }

  const entries = tail.readUInt16LE(eocdAt + 10);
  const size = tail.readUInt32LE(eocdAt + 12);
  const offset = tail.readUInt32LE(eocdAt + 16);

  const overflowed =
    offset === OVERFLOW32 || size === OVERFLOW32 || entries === OVERFLOW16;
  if (!overflowed) return { offset, size, entries };

  // ZIP64: the locator sits immediately before the EOCD and points at the
  // real record. A checkpoint over 4GB takes this path every time.
  const locatorAt = eocdAt - 20;
  if (locatorAt < 0 || tail.readUInt32LE(locatorAt) !== EOCD64_LOCATOR_SIGNATURE) {
    throw new ZipReadError("ZIP32 fields overflowed but no ZIP64 locator follows them");
  }

  const eocd64Offset = Number(tail.readBigUInt64LE(locatorAt + 8));
  const eocd64 = await readAt(handle, eocd64Offset, 56);
  if (eocd64.length < 56 || eocd64.readUInt32LE(0) !== EOCD64_SIGNATURE) {
    throw new ZipReadError("ZIP64 locator does not point at an end-of-central-directory record");
  }

  return {
    entries: Number(eocd64.readBigUInt64LE(32)),
    size: Number(eocd64.readBigUInt64LE(40)),
    offset: Number(eocd64.readBigUInt64LE(48)),
  };
}

/**
 * Pull the real 64-bit values out of an entry's ZIP64 extra field.
 *
 * The extra field is a sequence of (id, length, payload) blocks, and block
 * 0x0001 carries only those values whose ZIP32 field overflowed, in a fixed
 * order. So which values are present depends on the header that precedes it -
 * reading them positionally without checking is how a ZIP64 parser silently
 * returns an offset that belongs to a size.
 */
function readZip64Extra(
  extra: Buffer,
  wanted: { uncompressed: boolean; compressed: boolean; offset: boolean }
): { uncompressedSize?: number; compressedSize?: number; localHeaderOffset?: number } {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = extra.readUInt16LE(cursor);
    const length = extra.readUInt16LE(cursor + 2);
    const payload = extra.subarray(cursor + 4, cursor + 4 + length);
    cursor += 4 + length;
    if (id !== 0x0001) continue;

    const out: {
      uncompressedSize?: number;
      compressedSize?: number;
      localHeaderOffset?: number;
    } = {};
    let at = 0;
    const next = (): number | undefined => {
      if (at + 8 > payload.length) return undefined;
      const value = Number(payload.readBigUInt64LE(at));
      at += 8;
      return value;
    };
    if (wanted.uncompressed) out.uncompressedSize = next();
    if (wanted.compressed) out.compressedSize = next();
    if (wanted.offset) out.localHeaderOffset = next();
    return out;
  }
  return {};
}

/** Every entry in the archive's central directory. */
export async function listZipEntries(
  handle: FileHandle,
  fileSize: number
): Promise<ZipEntry[]> {
  const { offset, size, entries: declared } = await locateCentralDirectory(handle, fileSize);
  const directory = await readAt(handle, offset, size);

  const entries: ZipEntry[] = [];
  let cursor = 0;
  while (cursor + 46 <= directory.length) {
    if (directory.readUInt32LE(cursor) !== CENTRAL_HEADER_SIGNATURE) break;

    const compressionMethod = directory.readUInt16LE(cursor + 10);
    let compressedSize = directory.readUInt32LE(cursor + 20);
    let uncompressedSize = directory.readUInt32LE(cursor + 24);
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    let localHeaderOffset = directory.readUInt32LE(cursor + 42);

    const nameAt = cursor + 46;
    const name = directory.subarray(nameAt, nameAt + nameLength).toString("utf-8");
    const extra = directory.subarray(nameAt + nameLength, nameAt + nameLength + extraLength);

    const zip64 = readZip64Extra(extra, {
      uncompressed: uncompressedSize === OVERFLOW32,
      compressed: compressedSize === OVERFLOW32,
      offset: localHeaderOffset === OVERFLOW32,
    });
    uncompressedSize = zip64.uncompressedSize ?? uncompressedSize;
    compressedSize = zip64.compressedSize ?? compressedSize;
    localHeaderOffset = zip64.localHeaderOffset ?? localHeaderOffset;

    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    cursor = nameAt + nameLength + extraLength + commentLength;
    if (entries.length > declared && declared > 0) break;
  }

  return entries;
}

/**
 * Read one entry's bytes.
 *
 * `maxBytes` bounds the decompressed result: this is fed straight into a
 * parser, and a member that claims to be small and inflates to gigabytes is
 * exactly the shape of input a scanner has to survive.
 */
export async function readZipEntry(
  handle: FileHandle,
  entry: ZipEntry,
  maxBytes: number
): Promise<Buffer> {
  if (entry.uncompressedSize > maxBytes) {
    throw new ZipReadError(
      `Entry '${entry.name}' is ${entry.uncompressedSize} bytes, over the ${maxBytes} limit`
    );
  }

  // The local header repeats the name and extra field, and its lengths are
  // the authoritative ones - a ZIP is allowed to differ between the two, and
  // trusting the central directory's lengths here reads from the wrong offset.
  const header = await readAt(handle, entry.localHeaderOffset, 30);
  if (header.length < 30 || header.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) {
    throw new ZipReadError(`Entry '${entry.name}' has no local file header`);
  }
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  const dataAt = entry.localHeaderOffset + 30 + nameLength + extraLength;

  const raw = await readAt(handle, dataAt, entry.compressedSize);

  if (entry.compressionMethod === METHOD_STORED) return raw;
  if (entry.compressionMethod === METHOD_DEFLATE) {
    return inflateRawSync(raw, { maxOutputLength: maxBytes });
  }
  throw new ZipReadError(
    `Entry '${entry.name}' uses compression method ${entry.compressionMethod}, which this reader does not handle`
  );
}
