import { NextResponse } from "next/server";
import { getValidEbayAccessToken } from "@/lib/ebay/account";
import { discoverShippingServicesWithFallback } from "@/lib/ebay/shipping-services";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const marketplace = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";
    const { accessToken } = await getValidEbayAccessToken({
      supabase,
      userId: user.id,
      marketplace
    });
    const discovery = await discoverShippingServicesWithFallback(accessToken);

    return NextResponse.json({
      ok: true,
      marketplace,
      discoverySucceeded: discovery.discovered,
      discoveryError: discovery.discoveryError,
      discoveredServicesCount: discovery.discovered ? discovery.services.length : 0,
      services: discovery.discovered
        ? discovery.services.map((service) => ({
            shippingService: service.shippingService,
            description: service.description,
            internationalService: service.internationalService,
            validForSellingFlow: service.validForSellingFlow
          }))
        : [],
      fallbackServices: discovery.fallbackServices.map((service) => ({
        shippingService: service.shippingService,
        description: service.description,
        internationalService: service.internationalService,
        validForSellingFlow: service.validForSellingFlow
      }))
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not discover eBay shipping services."
      },
      { status: 400 }
    );
  }
}
