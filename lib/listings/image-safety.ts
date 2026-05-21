export function normalizeImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item ?? "").trim())
    .filter((url) => {
      if (!url) return false;

      try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    })
    .slice(0, 12);
}

export function chooseProductImageUrls(params: {
  supplierImageUrls?: unknown;
  optimizedImageUrls?: unknown;
}) {
  const supplierImages = normalizeImageUrls(params.supplierImageUrls);

  if (supplierImages.length > 0) {
    return supplierImages;
  }

  return normalizeImageUrls(params.optimizedImageUrls);
}

export function hasUsableProductImages(value: unknown) {
  return normalizeImageUrls(value).length > 0;
}
