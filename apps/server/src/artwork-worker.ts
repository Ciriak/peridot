import { parentPort } from "node:worker_threads";
import sharp from "sharp";
import type {
  ArtworkTransformRequest,
  ArtworkTransformResponse,
} from "./artwork-worker-protocol.js";

export const ARTWORK_MAX_DIMENSION = 400;
export const ARTWORK_WEBP_QUALITY = 75;

const MAX_INPUT_PIXELS = 40_000_000;
const MAX_OUTPUT_BYTES = 512 * 1024;
const OUTPUT_QUALITIES = [ARTWORK_WEBP_QUALITY, 65, 55, 45] as const;

sharp.cache(false);
sharp.concurrency(1);

async function transformArtwork(
  request: ArtworkTransformRequest,
): Promise<ArtworkTransformResponse> {
  try {
    let result:
      | {
          data: Buffer<ArrayBufferLike>;
          height: number;
          width: number;
        }
      | undefined;
    for (const quality of OUTPUT_QUALITIES) {
      const encoded = await sharp(request.data, {
        failOn: "error",
        limitInputPixels: MAX_INPUT_PIXELS,
        sequentialRead: true,
      })
        .rotate()
        .resize({
          fit: "inside",
          height: ARTWORK_MAX_DIMENSION,
          width: ARTWORK_MAX_DIMENSION,
          withoutEnlargement: true,
        })
        .webp({ effort: 4, quality })
        .toBuffer({ resolveWithObject: true });
      result = {
        data: encoded.data,
        height: encoded.info.height,
        width: encoded.info.width,
      };
      if (encoded.data.byteLength <= MAX_OUTPUT_BYTES) break;
    }
    if (!result || result.data.byteLength > MAX_OUTPUT_BYTES) {
      throw new Error("The normalized artwork is too large.");
    }
    if (
      result.width > ARTWORK_MAX_DIMENSION ||
      result.height > ARTWORK_MAX_DIMENSION
    ) {
      throw new Error("The normalized artwork exceeds the maximum dimensions.");
    }
    return {
      id: request.id,
      ok: true,
      result: {
        data: Uint8Array.from(result.data),
        height: result.height,
        width: result.width,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      id: request.id,
      ok: false,
    };
  }
}

if (!parentPort) {
  throw new Error("The artwork worker requires a parent port.");
}

const port = parentPort;
port.on("message", (request: ArtworkTransformRequest) => {
  void transformArtwork(request).then((response) => {
    port.postMessage(response);
  });
});
