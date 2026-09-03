import { z } from "zod";
import sharp from "sharp";
import { generateFontFaceCSS } from "./fonts.js";
import { ToolError } from "../utils/errors.js";

/**
 * Ceiling on a rendered edge. 8192x8192 is ~67M pixels - generous for any
 * real input image, and comfortably inside sharp's own default input-pixel
 * limit, so a bad argument is refused by the schema with a message naming the
 * range rather than by an out-of-memory somewhere under libvips.
 */
const MAX_RENDER_DIMENSION = 8192;

export const renderSvgSchema = z.object({
  svg: z.string().describe("SVG content to render (full SVG markup including <svg> tags)"),
  filename: z.string().optional().describe("Output filename (without extension). Defaults to 'svg_render_<timestamp>'"),
  // Bounded because these go straight to sharp's resize: an unbounded pair
  // asks for width*height pixels of canvas, so 100000x100000 is 10^10 pixels
  // and takes the server process down. A fractional or negative value threw
  // from inside sharp and surfaced through the handler's "check the SVG
  // markup" hint, which named the wrong problem entirely.
  width: z.number().int().min(1).max(MAX_RENDER_DIMENSION).optional().default(768)
    .describe(`Output width in pixels (1-${MAX_RENDER_DIMENSION}, default: 768)`),
  height: z.number().int().min(1).max(MAX_RENDER_DIMENSION).optional().default(768)
    .describe(`Output height in pixels (1-${MAX_RENDER_DIMENSION}, default: 768)`),
  background: z.string().optional().describe("Background color (default: transparent). Use hex like '#ffffff' or 'transparent'"),
  fonts: z.array(z.object({
    name: z.string().describe("Font name (must be downloaded first with comfyui_download_font)"),
    family: z.string().optional().describe("CSS font-family name to use in the SVG (defaults to font name)"),
  })).optional().describe("Fonts to embed in the SVG for rendering"),
}).strict();

export type RenderSvgInput = z.infer<typeof renderSvgSchema>;

export interface RenderSvgResult {
  success: boolean;
  filename?: string;
  buffer?: Buffer;
  error?: string;
}

// Matches href / xlink:href values that point at an external or local
// resource rather than an in-document fragment (#id) or a self-contained
// data: URI.
const EXTERNAL_HREF_PATTERN = /^\s*(?:https?|file|ftp):/i;

/**
 * Strip constructs that let SVG markup reach outside the document it came
 * in: <image>/<use>/<script>/<foreignObject> href targets pointing at a
 * remote URL or local file get rasterized (or executed) by the renderer,
 * turning caller-supplied SVG into an SSRF or local-file-read primitive -
 * the referenced content ends up embedded in the output PNG, which is
 * uploaded to ComfyUI and can flow back to the caller. This is deliberately
 * conservative: fragment references (#id) and data: URIs are left alone
 * since they're self-contained and cover the legitimate embedding cases.
 */
function sanitizeSvg(svg: string): string {
  let sanitized = svg;

  sanitized = sanitized.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  sanitized = sanitized.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");

  sanitized = sanitized.replace(
    /((?:xlink:)?href\s*=\s*)("([^"]*)"|'([^']*)')/gi,
    (match, prefix, _quoted, dq, sq) => {
      const value = dq ?? sq ?? "";
      if (EXTERNAL_HREF_PATTERN.test(value)) {
        return `${prefix}""`;
      }
      return match;
    }
  );

  return sanitized;
}

/**
 * Render SVG to PNG buffer for upload to ComfyUI.
 * Returns the buffer and filename for use with uploadImage API.
 */
export async function renderSvg(
  input: RenderSvgInput
): Promise<RenderSvgResult> {
  try {
    // Generate filename if not provided
    const timestamp = Date.now();
    const filename = input.filename || `svg_render_${timestamp}`;
    const outputFilename = `${filename}.png`;

    // Parse and modify SVG to ensure proper dimensions
    let svgContent = sanitizeSvg(input.svg);

    // Embed fonts if specified
    if (input.fonts && input.fonts.length > 0) {
      const fontFaces: string[] = [];
      const missing: string[] = [];

      for (const font of input.fonts) {
        const css = await generateFontFaceCSS(font.name, font.family);
        if (css) {
          fontFaces.push(css);
        } else {
          missing.push(font.name);
        }
      }

      // A font that is not in the cache used to be skipped in silence, and the
      // render came back success:true in the renderer's default sans-serif -
      // so the caller shipped an image believing its typography had applied.
      // The whole point of naming a font here is that it should be used.
      if (missing.length > 0) {
        throw new ToolError(
          `Not downloaded: ${missing.join(", ")}. Rendering would silently substitute a default face.`,
          `Call comfyui_download_font for each of them first, or comfyui_list_fonts to see what is already cached under a different name.`
        );
      }

      if (fontFaces.length > 0) {
        // Inject font-face declarations into SVG
        const fontStyle = `<defs><style type="text/css">\n${fontFaces.join("\n")}\n</style></defs>`;

        // Insert after opening <svg> tag
        svgContent = svgContent.replace(/<svg([^>]*)>/, `<svg$1>${fontStyle}`);
      }
    }

    // Add whichever of width/height/viewBox the *root* element is missing.
    //
    // These used to be bare substring tests over the whole document, so a
    // `width=` on any child <rect> meant the root never got dimensions. The
    // width/height pair was also joined with &&, so a root declaring only one
    // of them got neither.
    const rootTag = svgContent.match(/<svg\b[^>]*>/)?.[0] ?? "";
    // Attributes are whitespace-separated in the tag. \b would match after a
    // hyphen, so a root carrying stroke-width= counted as having width=.
    const rootHas = (attr: string) => new RegExp(`\\s${attr}\\s*=`).test(rootTag);

    const missingAttrs: string[] = [];
    if (!rootHas("width")) missingAttrs.push(`width="${input.width}"`);
    if (!rootHas("height")) missingAttrs.push(`height="${input.height}"`);
    if (!rootHas("viewBox")) missingAttrs.push(`viewBox="0 0 ${input.width} ${input.height}"`);

    if (missingAttrs.length > 0) {
      svgContent = svgContent.replace("<svg", `<svg ${missingAttrs.join(" ")}`);
    }

    // Create a buffer from SVG
    const svgBuffer = Buffer.from(svgContent);

    // Determine background
    const hasBackground = input.background && input.background !== 'transparent';

    // Rasterise to exactly the requested size first, whichever branch runs.
    //
    // The background branch used to composite the raw SVG onto a
    // width x height canvas. An SVG declaring its own larger dimensions -
    // say viewBox 1024 with the default 768 requested - made sharp throw
    // "Image to composite must have same dimensions or smaller", reported
    // through the misleading "check the SVG markup is well-formed" hint.
    const rasterised = await sharp(svgBuffer)
      .resize(input.width!, input.height!, { fit: "contain" })
      .png()
      .toBuffer();

    let pngBuffer: Buffer;
    if (hasBackground) {
      // Render with solid background
      pngBuffer = await sharp({
        create: {
          width: input.width!,
          height: input.height!,
          channels: 4,
          background: input.background!,
        },
      })
        .composite([
          {
            input: rasterised,
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toBuffer();
    } else {
      // Render SVG directly (transparent background)
      pngBuffer = rasterised;
    }

    return {
      success: true,
      filename: outputFilename,
      buffer: pngBuffer,
    };
  } catch (error) {
    // A ToolError already knows what the caller should do next; swallowing it
    // into this result's bare `error` string would replace that with the
    // handler's generic "check the SVG markup" hint.
    if (error instanceof ToolError) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
