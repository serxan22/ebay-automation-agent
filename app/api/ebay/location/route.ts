import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { ensureInventoryLocation, getInventoryLocations } from "@/lib/ebay/locations";
import { getValidEbayAccessToken } from "@/lib/ebay/account";
import { normalizePublishError } from "@/lib/ebay/publish";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

const locationSchema = z.object({
  merchantLocationKey: z.string().min(3).max(50).optional(),
  name: z.string().min(2).max(80).optional(),
  addressLine1: z.string().min(2).max(128).optional(),
  country: z.string().length(2).default("US"),
  postalCode: z.string().min(3).max(16).optional(),
  city: z.string().max(128).optional(),
  stateOrProvince: z.string().max(128).optional()
});

export async function GET() {
  let supabase: SupabaseClient | null = null;
  let userId: string | null = null;

  try {
    const context = await getContext();
    supabase = context.supabase;
    userId = context.userId;
    const { accessToken } = await getValidEbayAccessToken({
      supabase: context.supabase,
      userId: context.userId
    });
    const locations = await getInventoryLocations(accessToken);

    return NextResponse.json({ ok: true, locations: locations.locations ?? [] });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    const normalized = normalizePublishError(error);

    if (supabase && userId) {
      await logAutomationEvent({
        supabase,
        userId,
        level: "error",
        module: "ebay_location",
        message: "ebay_location_setup_failed",
        metadata: { error: normalized.message, code: normalized.code, recommendation: normalized.recommendation, details: normalized.details }
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: normalized.message,
        message: normalized.message,
        code: normalized.code,
        recommendation: normalized.recommendation,
        details: normalized.details
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  let supabase: SupabaseClient | null = null;
  let userId: string | null = null;

  try {
    const context = await getContext();
    supabase = context.supabase;
    userId = context.userId;
    const body = request.headers.get("content-length") === "0" ? {} : await request.json().catch(() => ({}));
    const input = locationSchema.parse(body);
    const result = await ensureInventoryLocation({
      supabase: context.supabase,
      userId: context.userId,
      input
    });

    return NextResponse.json({ ok: true, location: result.location, account: result.account });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    const normalized = normalizePublishError(error);

    if (supabase && userId) {
      await logAutomationEvent({
        supabase,
        userId,
        level: "error",
        module: "ebay_location",
        message: "ebay_location_setup_failed",
        metadata: { error: normalized.message, code: normalized.code, recommendation: normalized.recommendation, details: normalized.details }
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: normalized.message,
        message: normalized.message,
        code: normalized.code,
        recommendation:
          normalized.recommendation ??
          "Create a warehouse location with a country plus postal code, or city/state/country, then retry.",
        details: normalized.details
      },
      { status: 400 }
    );
  }
}

async function getContext() {
  const { supabase, user } = await getAuthenticatedApiContext();
  return { supabase, userId: user.id };
}
