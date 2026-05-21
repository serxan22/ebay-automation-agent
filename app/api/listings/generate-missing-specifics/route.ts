import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateMissingItemSpecificsForUser,
  normalizeItemSpecificsRouteError
} from "@/lib/listings/item-specifics";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

const generateMissingSpecificsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional()
});

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const body = await request.json().catch(() => ({}));
    const payload = generateMissingSpecificsSchema.parse(body);
    const result = await generateMissingItemSpecificsForUser({
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

    const normalized = normalizeItemSpecificsRouteError(error);
    return NextResponse.json({ ok: false, ...normalized }, { status: 400 });
  }
}
