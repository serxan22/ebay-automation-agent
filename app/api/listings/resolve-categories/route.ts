import { NextResponse } from "next/server";
import { z } from "zod";
import {
  normalizeCategoryRouteError,
  resolveMissingCategoriesForUser
} from "@/lib/listings/category-resolution";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

const resolveCategoriesSchema = z.object({
  limit: z.number().int().min(1).max(20).optional()
});

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const body = await request.json().catch(() => ({}));
    const payload = resolveCategoriesSchema.parse(body);
    const result = await resolveMissingCategoriesForUser({
      supabase,
      userId: user.id,
      limit: payload.limit
    });

    return NextResponse.json(result);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    const normalized = normalizeCategoryRouteError(error);
    return NextResponse.json({ ok: false, ...normalized }, { status: 400 });
  }
}
