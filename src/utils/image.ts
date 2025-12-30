import sharp from "sharp";

export interface ImageProcessingOptions {
  /** Output format (default: jpeg for smaller size) */
  format?: "jpeg" | "png" | "webp";
  /** JPEG/WebP quality 1-100 (default: 85) */
  quality?: number;
  /** Max width - will resize proportionally if larger */
  maxWidth?: number;
  /** Max height - will resize proportionally if larger */
  maxHeight?: number;
}

export interface ProcessedImage {
  data: string; // base64
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  processedSize: number;
}

/**
 * Process an image buffer for optimal MCP transfer
 * - Converts to JPEG by default for smaller file sizes
 * - Optionally resizes large images
 */
export async function processImageForTransfer(
  buffer: Buffer,
  options: ImageProcessingOptions = {}
): Promise<ProcessedImage> {
  const {
    format = "jpeg",
    quality = 85,
    maxWidth,
    maxHeight,
  } = options;

  const originalSize = buffer.length;

  let pipeline = sharp(buffer);
  const metadata = await pipeline.metadata();

  // Resize if needed
  if (maxWidth || maxHeight) {
    pipeline = pipeline.resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Convert to output format
  let processedBuffer: Buffer;
  let mimeType: string;

  switch (format) {
    case "jpeg":
      processedBuffer = await pipeline.jpeg({ quality }).toBuffer();
      mimeType = "image/jpeg";
      break;
    case "webp":
      processedBuffer = await pipeline.webp({ quality }).toBuffer();
      mimeType = "image/webp";
      break;
    case "png":
    default:
      processedBuffer = await pipeline.png().toBuffer();
      mimeType = "image/png";
      break;
  }

  // Get final dimensions
  const finalMetadata = await sharp(processedBuffer).metadata();

  return {
    data: processedBuffer.toString("base64"),
    mimeType,
    width: finalMetadata.width || metadata.width || 0,
    height: finalMetadata.height || metadata.height || 0,
    originalSize,
    processedSize: processedBuffer.length,
  };
}

/**
 * Default processing options optimized for MCP transfer
 * - JPEG format for ~5-10x smaller than PNG
 * - Quality 85 for good balance of size and quality
 */
export const DEFAULT_TRANSFER_OPTIONS: ImageProcessingOptions = {
  format: "jpeg",
  quality: 85,
};

/**
 * Check if an image buffer is too large for efficient transfer
 * Threshold is 1MB by default
 */
export function isImageTooLarge(buffer: Buffer, threshold = 1024 * 1024): boolean {
  return buffer.length > threshold;
}
