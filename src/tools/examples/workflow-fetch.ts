/**
 * Reading the workflow ComfyUI embeds in a PNG it saved.
 *
 * ComfyUI writes the graph into the file's text chunks, so a PNG a user
 * already has is a runnable workflow. `extract_workflow` is the one caller.
 *
 * This module has shed two jobs. It was `list-examples.ts`, carrying the
 * `list_examples` and `get_example_workflow` tools, which went in favour of
 * the Comfy template gallery. It then carried the URL fetchers for the
 * bundled example catalogue, which went when that catalogue did. What is
 * left is the parser, which stands on its own.
 */


// Refuse to even attempt parsing implausibly large "PNG" data. Without
// this, a URL-fetching caller (extract_workflow) that
// hits a malicious/misbehaving server with a huge response body would carry
// that entire body through TextDecoder + JSON.parse below.
const MAX_PNG_SIZE = 50 * 1024 * 1024; // 50MB - generous for a real PNG

// workflow/prompt metadata is normally KB-sized JSON; cap what we'll
// attempt to JSON.parse so a crafted chunk can't force a huge parse/alloc.
const MAX_TEXT_VALUE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Extract workflow JSON from PNG metadata
 * ComfyUI embeds workflow data in PNG tEXt chunks with key "workflow" or "prompt"
 */
export async function extractWorkflowFromPng(
  imageData: ArrayBuffer
): Promise<{ workflow?: Record<string, unknown>; prompt?: Record<string, unknown> } | null> {
  if (imageData.byteLength > MAX_PNG_SIZE) {
    return null;
  }

  const data = new Uint8Array(imageData);

  // PNG signature check
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (data[i] !== pngSignature[i]) {
      return null; // Not a PNG
    }
  }

  const result: { workflow?: Record<string, unknown>; prompt?: Record<string, unknown> } = {};

  // Parse PNG chunks. Every declared length is untrusted input from the
  // file itself, so it's validated against what's actually left in the
  // buffer before being used to slice - a corrupt or crafted file could
  // otherwise declare a length far past the end of the data.
  let offset = 8;
  while (offset + 8 <= data.length) {
    // Read chunk length (4 bytes, big-endian, unsigned)
    const length =
      ((data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3]) >>>
      0;
    offset += 4;

    // Read chunk type (4 bytes)
    const type = String.fromCharCode(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      data[offset + 3]
    );
    offset += 4;

    // A declared length that runs past the end of the buffer means the
    // file is malformed or hostile - stop parsing rather than trusting it.
    if (length > data.length - offset) {
      break;
    }

    // Read chunk data
    const chunkData = data.slice(offset, offset + length);
    offset += length;

    // Skip CRC (4 bytes)
    offset += 4;

    // Check for tEXt or iTXt chunks
    if (type === "tEXt" || type === "iTXt") {
      // Find null separator between key and value
      let nullIndex = 0;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullIndex = i;
          break;
        }
      }

      const key = new TextDecoder().decode(chunkData.slice(0, nullIndex));
      let value: string;

      if (type === "tEXt") {
        // tEXt: key\0value
        value = new TextDecoder().decode(chunkData.slice(nullIndex + 1));
      } else {
        // iTXt: key\0 flag method language\0 translated\0 text
        //
        // The compression flag and method are two *fixed* bytes, not
        // NUL-terminated fields, and both are normally zero - so counting
        // NULs from the keyword separator spends two of them on those bytes
        // and stops one field early, leaving a leading NUL on every value.
        // Skip the two bytes first, then two NUL-terminated strings.
        const flag = chunkData[nullIndex + 1];
        let valueStart = nullIndex + 3;
        let nullCount = 0;
        while (valueStart < chunkData.length && nullCount < 2) {
          if (chunkData[valueStart] === 0) nullCount++;
          valueStart++;
        }

        // A compression flag of 1 means the text is zlib-deflated. Decoding
        // it as UTF-8 would yield noise that fails JSON.parse anyway, so
        // report nothing rather than a value this parser did not read.
        value = nullCount === 2 && flag === 0
          ? new TextDecoder().decode(chunkData.slice(valueStart))
          : "";
      }

      // Parse workflow or prompt JSON
      if ((key === "workflow" || key === "prompt") && value.length <= MAX_TEXT_VALUE_SIZE) {
        try {
          const parsed = JSON.parse(value);
          if (key === "workflow") {
            result.workflow = parsed;
          } else {
            result.prompt = parsed;
          }
        } catch {
          // Invalid JSON, skip
        }
      }
    }

    // Stop at IEND chunk
    if (type === "IEND") {
      break;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}
