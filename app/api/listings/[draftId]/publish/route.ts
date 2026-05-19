import { NextResponse } from "next/server";
import { z } from "zod";
import { logAutomationEvent } from "@/lib/automation/logging";
import { normalizePublishError, publishListingDraftToEbaySandbox } from "@/lib/ebay/publish";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

const publishParamsSchema = z.object({
  draftId: z.string().uuid()
});

export async function POST(_request: Request, { params }: { params: { draftId: string } }) {
  try {
    const parsedParams = publishParamsSchema.parse(params);

    if (!hasSupabaseServerEnv()) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data: draft, error: draftError } = await supabase
      .from("listing_drafts")
      .select("id,status")
      .eq("id", parsedParams.draftId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (draftError) {
      throw new Error(draftError.message);
    }

    if (!draft) {
      return NextResponse.json({ error: "Listing draft was not found." }, { status: 404 });
    }

    if (draft.status !== "approved") {
      await logAutomationEvent({
        supabase,
        userId: user.id,
        level: "warning",
        module: "ebay_publish",
        message: "ebay_publish_validation_failed",
        metadata: { draftId: parsedParams.draftId, status: draft.status }
      });

      return NextResponse.json(
        { ok: false, error: "Approve this draft before publishing.", code: "PUBLISH_READINESS_FAILED" },
        { status: 400 }
      );
    }

    const result = await publishListingDraftToEbaySandbox({
      supabase,
      userId: user.id,
      draftId: parsedParams.draftId
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const normalized = normalizePublishError(error);
    return NextResponse.json(
      {
        ok: false,
        error: normalized.message,
        code: normalized.code,
        recommendation: normalized.recommendation,
        details: normalized.details
      },
      { status: 400 }
    );
  }
}
