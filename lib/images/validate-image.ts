import { z } from "zod";

export const imageValidationResultSchema = z.object({
  ok: z.boolean(),
  url: z.string(),
  contentType: z.string().optional(),
  contentLength: z.number().optional(),
  reason: z.string().optional()
});

export type ImageValidationResult = z.infer<typeof imageValidationResultSchema>;

const allowedProtocols = new Set(["https:", "http:"]);
const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function validateImageUrl(url: string): Promise<ImageValidationResult> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, url, reason: "Invalid image URL." };
  }

  if (!allowedProtocols.has(parsed.protocol)) {
    return { ok: false, url, reason: "Image URL must use HTTP or HTTPS." };
  }

  try {
    const response = await fetch(url, { method: "HEAD" });
    const contentType = response.headers.get("content-type") ?? undefined;
    const contentLength = Number(response.headers.get("content-length") ?? 0);

    if (!response.ok) {
      return { ok: false, url, reason: `Image returned HTTP ${response.status}.` };
    }

    if (contentType && !allowedContentTypes.has(contentType.split(";")[0].toLowerCase())) {
      return { ok: false, url, contentType, reason: "Unsupported image content type." };
    }

    return { ok: true, url, contentType, contentLength: Number.isFinite(contentLength) ? contentLength : undefined };
  } catch (error) {
    return {
      ok: false,
      url,
      reason: error instanceof Error ? error.message : "Image validation failed."
    };
  }
}
