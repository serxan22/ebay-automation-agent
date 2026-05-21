import { NextResponse } from "next/server";
import { z } from "zod";
import {
  normalizeCategoryRouteError,
  resolveCategoryForDraft
} from "@/lib/listings/category-resolution";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

const paramsSchema = z.object({
  draftId: z.string().uuid()
});

export async function POST(_request: Request, { params }: { params: { draftId: string } }) {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const { draftId } = paramsSchema.parse(params);
    const result = await resolveCategoryForDraft({ supabase, userId: user.id, draftId });

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    const normalized = normalizeCategoryRouteError(error);
    return NextResponse.json({ ok: false, ...normalized }, { status: 400 });
  }
}
