import { ebayFetch } from "@/lib/ebay/client";
import { EbayIntegrationError } from "@/lib/ebay/errors";

export interface InventoryItemInput {
  sku: string;
  title: string;
  description: string;
  quantity: number;
  imageUrls: string[];
  condition: string;
  aspects: Record<string, string | string[]>;
}

export async function createOrReplaceInventoryItem(accessToken: string, input: InventoryItemInput) {
  if (!input.sku) {
    throw new EbayIntegrationError("Missing SKU for inventory item.", "DUPLICATE_SKU");
  }

  if (input.imageUrls.length === 0) {
    throw new EbayIntegrationError("At least one optimized image is required.", "IMAGE_ERROR");
  }

  return ebayFetch<Record<string, never>>({
    accessToken,
    path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(input.sku)}`,
    method: "PUT",
    body: {
      availability: {
        shipToLocationAvailability: {
          quantity: input.quantity
        }
      },
      condition: input.condition,
      product: {
        title: input.title,
        description: input.description,
        imageUrls: input.imageUrls,
        aspects: input.aspects
      }
    }
  });
}
