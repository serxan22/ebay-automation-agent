import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EbayIntegrationError } from "@/lib/ebay/errors";

export interface EbayOAuthStateRecord {
  id: string;
  user_id: string;
  state: string;
  created_at: string;
  consumed_at?: string | null;
}

const stateTtlMs = 15 * 60 * 1000;

export async function createEbayOAuthState({
  supabase,
  userId
}: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const state = crypto.randomBytes(32).toString("base64url");
  const { data, error } = await supabase
    .from("ebay_oauth_states")
    .insert({
      user_id: userId,
      state
    })
    .select("id,user_id,state,created_at,consumed_at")
    .single();

  if (error) {
    throw new Error(`Unable to save eBay OAuth state: ${error.message}`);
  }

  return data as EbayOAuthStateRecord;
}

export async function validateAndConsumeEbayOAuthState({
  supabase,
  state
}: {
  supabase: SupabaseClient;
  state: string;
}) {
  const { data, error } = await supabase
    .from("ebay_oauth_states")
    .select("id,user_id,state,created_at,consumed_at")
    .eq("state", state)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to validate eBay OAuth state: ${error.message}`);
  }

  if (!data) {
    throw new EbayIntegrationError(
      "eBay OAuth state was not found. Start the sandbox connection again from Settings.",
      "OAUTH_STATE_INVALID",
      "Open Settings and click Connect sandbox again."
    );
  }

  const record = data as EbayOAuthStateRecord;

  if (record.consumed_at) {
    throw new EbayIntegrationError(
      "This eBay OAuth state was already used. Start the sandbox connection again from Settings.",
      "OAUTH_STATE_INVALID",
      "Open Settings and click Connect sandbox again."
    );
  }

  if (new Date(record.created_at).getTime() < Date.now() - stateTtlMs) {
    throw new EbayIntegrationError(
      "eBay OAuth state expired. Start the sandbox connection again from Settings.",
      "OAUTH_STATE_EXPIRED",
      "OAuth connection links expire after 15 minutes."
    );
  }

  const consumedAt = new Date().toISOString();
  const { data: consumed, error: consumeError } = await supabase
    .from("ebay_oauth_states")
    .update({ consumed_at: consumedAt })
    .eq("id", record.id)
    .is("consumed_at", null)
    .select("id,user_id,state,created_at,consumed_at")
    .single();

  if (consumeError) {
    throw new Error(`Unable to consume eBay OAuth state: ${consumeError.message}`);
  }

  return consumed as EbayOAuthStateRecord;
}
