import sharp from "sharp";
import { validateImageUrl } from "@/lib/images/validate-image";
import { storeOptimizedImage } from "@/lib/images/store-image";

export interface OptimizeProductImagesInput {
  imageUrls: string[];
  userId?: string;
  supplierProductId?: string;
  store?: boolean;
  maxImages?: number;
}

export interface OptimizeProductImagesResult {
  optimizedUrls: string[];
  rejected: Array<{ url: string; reason: string }>;
  warnings: string[];
}

const IMAGE_DOWNLOAD_TIMEOUT_MS = 12_000;

export async function optimizeProductImages({
  imageUrls,
  userId,
  supplierProductId,
  store = false,
  maxImages = 8
}: OptimizeProductImagesInput): Promise<OptimizeProductImagesResult> {
  const uniqueUrls = Array.from(new Set(imageUrls.filter(Boolean))).slice(0, maxImages);
  const optimizedUrls: string[] = [];
  const rejected: Array<{ url: string; reason: string }> = [];
  const warnings: string[] = [];

  if (!store) {
    warnings.push("Supabase Storage is not configured for this run; validated external image URLs were kept.");
  }

  for (const [index, url] of uniqueUrls.entries()) {
    const validation = await validateImageUrl(url);

    if (!validation.ok) {
      rejected.push({ url, reason: validation.reason ?? "Image failed validation." });
      continue;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT_MS);
      let response: Response;

      try {
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        rejected.push({ url, reason: `Image download returned HTTP ${response.status}.` });
        continue;
      }

      const source = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(source).metadata();

      if ((metadata.width ?? 0) < 500 || (metadata.height ?? 0) < 500) {
        rejected.push({ url, reason: "Image is below the 500px minimum resolution." });
        continue;
      }

      const optimized = await sharp(source)
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true
        })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();

      // TODO: add a full image automation queue for background optimization and upload retries.
      if (store && userId && supplierProductId) {
        const publicUrl = await storeOptimizedImage({
          userId,
          supplierProductId,
          filename: `image-${index + 1}.jpg`,
          bytes: optimized,
          contentType: "image/jpeg"
        });
        optimizedUrls.push(publicUrl);
      } else {
        optimizedUrls.push(url);
      }
    } catch (error) {
      rejected.push({
        url,
        reason: error instanceof Error ? error.message : "Image optimization failed."
      });
    }
  }

  return { optimizedUrls, rejected, warnings };
}
