import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getValidEbayAccessToken } from "@/lib/ebay/account";
import { ebayFetch } from "@/lib/ebay/client";
import { EbayIntegrationError } from "@/lib/ebay/errors";

export interface EbayInventoryLocationInput {
  merchantLocationKey: string;
  name: string;
  country: string;
  postalCode?: string;
  city?: string;
  stateOrProvince?: string;
}

export interface EbayInventoryLocation {
  merchantLocationKey: string;
  name?: string;
  merchantLocationStatus?: string;
  location?: {
    address?: {
      city?: string;
      country?: string;
      postalCode?: string;
      stateOrProvince?: string;
    };
  };
}

export const defaultSandboxInventoryLocationKey = "default-sandbox-location";

export async function getInventoryLocations(accessToken: string) {
  return ebayFetch<{ locations?: EbayInventoryLocation[] }>({
    accessToken,
    path: "/sell/inventory/v1/location?limit=100&offset=0"
  });
}

export async function getInventoryLocation(accessToken: string, merchantLocationKey: string) {
  return ebayFetch<EbayInventoryLocation>({
    accessToken,
    path: `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`
  });
}

export async function createInventoryLocation(accessToken: string, input: EbayInventoryLocationInput) {
  return ebayFetch<Record<string, never>>({
    accessToken,
    path: `/sell/inventory/v1/location/${encodeURIComponent(input.merchantLocationKey)}`,
    method: "POST",
    body: {
      name: input.name,
      merchantLocationStatus: "ENABLED",
      locationTypes: ["WAREHOUSE"],
      location: {
        address: {
          country: input.country,
          postalCode: input.postalCode,
          city: input.city,
          stateOrProvince: input.stateOrProvince
        }
      }
    }
  });
}

export async function ensureInventoryLocation({
  supabase,
  userId,
  input,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
}: {
  supabase: SupabaseClient;
  userId: string;
  input?: Partial<EbayInventoryLocationInput>;
  marketplaceId?: string;
}) {
  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_location",
    message: "ebay_location_setup_started",
    metadata: { marketplaceId }
  });

  const { account, accessToken } = await getValidEbayAccessToken({
    supabase,
    userId,
    marketplace: marketplaceId
  });
  const merchantLocationKey =
    input?.merchantLocationKey ?? account.inventory_location_key ?? defaultSandboxInventoryLocationKey;
  let location: EbayInventoryLocation | null = null;

  try {
    location = await getInventoryLocation(accessToken, merchantLocationKey);
  } catch (error) {
    if (!(error instanceof EbayIntegrationError) || error.code !== "NOT_FOUND") {
      throw error;
    }

    await createInventoryLocation(accessToken, {
      merchantLocationKey,
      name: input?.name ?? "eBay Agent Sandbox Warehouse",
      country: input?.country ?? "US",
      postalCode: input?.postalCode ?? "10001",
      city: input?.city,
      stateOrProvince: input?.stateOrProvince
    });
    location = {
      merchantLocationKey,
      name: input?.name ?? "eBay Agent Sandbox Warehouse",
      merchantLocationStatus: "ENABLED",
      location: {
        address: {
          country: input?.country ?? "US",
          postalCode: input?.postalCode ?? "10001",
          city: input?.city,
          stateOrProvince: input?.stateOrProvince
        }
      }
    };
  }

  const { data, error } = await supabase
    .from("ebay_accounts")
    .update({
      inventory_location_key: merchantLocationKey,
      inventory_location_name: location.name ?? input?.name ?? "eBay Agent Sandbox Warehouse",
      inventory_location_status: location.merchantLocationStatus ?? "ENABLED",
      last_location_sync_at: new Date().toISOString()
    })
    .eq("id", account.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "ebay_location",
    message: "ebay_location_setup_success",
    metadata: {
      marketplaceId,
      merchantLocationKey,
      status: location.merchantLocationStatus ?? "ENABLED"
    }
  });

  return { account: data, location };
}
