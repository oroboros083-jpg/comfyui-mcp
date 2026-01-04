import { z } from "zod";
import sharp from "sharp";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { generateFontFaceCSS } from "./fonts.js";

export const renderSvgSchema = z.object({
  svg: z.string().describe("SVG content to render (full SVG markup including <svg> tags)"),
  filename: z.string().optional().describe("Output filename (without extension). Defaults to 'svg_render_<timestamp>'"),
  width: z.number().optional().default(768).describe("Output width in pixels (default: 768)"),
  height: z.number().optional().default(768).describe("Output height in pixels (default: 768)"),
  background: z.string().optional().describe("Background color (default: transparent). Use hex like '#ffffff' or 'transparent'"),
  fonts: z.array(z.object({
    name: z.string().describe("Font name (must be downloaded first with download_font)"),
    family: z.string().optional().describe("CSS font-family name to use in the SVG (defaults to font name)"),
  })).optional().describe("Fonts to embed in the SVG for rendering"),
});

export type RenderSvgInput = z.infer<typeof renderSvgSchema>;

export interface RenderSvgResult {
  success: boolean;
  filename?: string;
  path?: string;
  error?: string;
}

/**
 * Render SVG to PNG and save to ComfyUI's input folder.
 * Returns the filename for use in LoadImage nodes.
 */
export async function renderSvg(
  comfyuiInputDir: string,
  input: RenderSvgInput
): Promise<RenderSvgResult> {
  try {
    // Ensure input directory exists
    if (!existsSync(comfyuiInputDir)) {
      await mkdir(comfyuiInputDir, { recursive: true });
    }

    // Generate filename if not provided
    const timestamp = Date.now();
    const filename = input.filename || `svg_render_${timestamp}`;
    const outputFilename = `${filename}.png`;
    const outputPath = join(comfyuiInputDir, outputFilename);

    // Parse and modify SVG to ensure proper dimensions
    let svgContent = input.svg;

    // Embed fonts if specified
    if (input.fonts && input.fonts.length > 0) {
      const fontFaces: string[] = [];

      for (const font of input.fonts) {
        const css = await generateFontFaceCSS(font.name, font.family);
        if (css) {
          fontFaces.push(css);
        }
      }

      if (fontFaces.length > 0) {
        // Inject font-face declarations into SVG
        const fontStyle = `<defs><style type="text/css">\n${fontFaces.join("\n")}\n</style></defs>`;

        // Insert after opening <svg> tag
        svgContent = svgContent.replace(/<svg([^>]*)>/, `<svg$1>${fontStyle}`);
      }
    }

    // If SVG doesn't have width/height attributes, add them
    if (!svgContent.includes('width=') && !svgContent.includes('height=')) {
      svgContent = svgContent.replace(
        '<svg',
        `<svg width="${input.width}" height="${input.height}"`
      );
    }

    // Add viewBox if not present (helps with scaling)
    if (!svgContent.includes('viewBox=')) {
      svgContent = svgContent.replace(
        '<svg',
        `<svg viewBox="0 0 ${input.width} ${input.height}"`
      );
    }

    // Create a buffer from SVG
    const svgBuffer = Buffer.from(svgContent);

    // Determine background
    const hasBackground = input.background && input.background !== 'transparent';

    if (hasBackground) {
      // Render with solid background
      await sharp({
        create: {
          width: input.width!,
          height: input.height!,
          channels: 4,
          background: input.background!,
        },
      })
        .composite([
          {
            input: svgBuffer,
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toFile(outputPath);
    } else {
      // Render SVG directly (transparent background)
      await sharp(svgBuffer)
        .resize(input.width!, input.height!, { fit: 'contain' })
        .png()
        .toFile(outputPath);
    }

    return {
      success: true,
      filename: outputFilename,
      path: outputPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
