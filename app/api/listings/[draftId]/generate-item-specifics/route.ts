import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateItemSpecificsForDraft,
  normalizeItemSpecificsRouteError
} from "@/lib/listings/item-specifics";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

const paramsSchema = z.object({
  draftId: z.string().uuid()
});

export async function POST(_request: Request, { params }: { params: { draftId: string } }) {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const { draftId } = paramsSchema.parse(params);
    const result = await generateItemSpecificsForDraft({ supabase, userId: user.id, draftId });

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    const normalized = normalizeItemSpecificsRouteError(error);
    return NextResponse.json({ ok: false, ...normalized }, { status: 400 });
  }
}
