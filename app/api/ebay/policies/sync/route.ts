import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { normalizePublishError } from "@/lib/ebay/publish";
import { syncSellerPolicies } from "@/lib/ebay/policies";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export async function POST() {
  let supabase: SupabaseClient | null = null;
  let userId: string | null = null;

  try {
    if (!hasSupabaseServerEnv()) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
    }

    supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    userId = user.id;
    const result = await syncSellerPolicies({
      supabase,
      userId: user.id
    });

    return NextResponse.json({
      ok: true,
      policies: result.policies,
      account: result.account
    });
  } catch (error) {
    const normalized = normalizePublishError(error);

    if (supabase && userId) {
      await logAutomationEvent({
        supabase,
        userId,
        level: "error",
        module: "ebay_policies",
        message: normalized.message,
        metadata: {
          code: normalized.code,
          recommendation: normalized.recommendation,
          details: normalized.details
        }
      });
    }

    return NextResponse.json(
      {
        error: normalized.message,
        code: normalized.code,
        recommendation:
          normalized.recommendation ??
          "Make sure the sandbox seller is opted into Business Policies and has payment, return, and fulfillment policies."
      },
      { status: 400 }
    );
  }
}
