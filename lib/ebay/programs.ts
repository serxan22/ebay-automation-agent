import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getValidEbayAccessToken } from "@/lib/ebay/account";
import { ebayFetch } from "@/lib/ebay/client";

export const SELLING_POLICY_MANAGEMENT = "SELLING_POLICY_MANAGEMENT";

export interface EbaySellerProgram {
  programType: string;
}

export interface EbaySellerProgramsResponse {
  programs: EbaySellerProgram[];
}

export async function getOptedInPrograms(accessToken: string) {
  return ebayFetch<EbaySellerProgramsResponse>({
    accessToken,
    path: "/sell/account/v1/program/get_opted_in_programs"
  });
}

export async function optInToSellingPolicyManagement(accessToken: string) {
  return ebayFetch<Record<string, never>>({
    accessToken,
    method: "POST",
    path: "/sell/account/v1/program/opt_in",
    body: { programType: SELLING_POLICY_MANAGEMENT }
  });
}

export async function checkEbaySellerPrograms({
  supabase,
  userId,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
}: {
  supabase: SupabaseClient;
  userId: string;
  marketplaceId?: string;
}) {
  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_programs",
    message: "ebay_programs_check_started",
    metadata: { marketplaceId }
  });

  const { accessToken } = await getValidEbayAccessToken({
    supabase,
    userId,
    marketplace: marketplaceId
  });
  const response = await getOptedInPrograms(accessToken);
  const programs = response.programs ?? [];
  const sellingPolicyManagementActive = programs.some((program) => program.programType === SELLING_POLICY_MANAGEMENT);

  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "ebay_programs",
    message: "ebay_programs_check_success",
    metadata: {
      marketplaceId,
      programsCount: programs.length,
      sellingPolicyManagementActive
    }
  });

  return formatProgramsStatus(programs);
}

export async function requestSellingPolicyManagementOptIn({
  supabase,
  userId,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
}: {
  supabase: SupabaseClient;
  userId: string;
  marketplaceId?: string;
}) {
  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_programs",
    message: "ebay_selling_policy_opt_in_started",
    metadata: { marketplaceId, programType: SELLING_POLICY_MANAGEMENT }
  });

  const { accessToken } = await getValidEbayAccessToken({
    supabase,
    userId,
    marketplace: marketplaceId
  });

  await optInToSellingPolicyManagement(accessToken);

  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "ebay_programs",
    message: "ebay_selling_policy_opt_in_success",
    metadata: { marketplaceId, programType: SELLING_POLICY_MANAGEMENT }
  });

  return {
    ok: true,
    message:
      "Selling Policy Management opt-in requested. eBay may take some time to activate it. Try Sync seller policies again."
  };
}

export function formatProgramsStatus(programs: EbaySellerProgram[]) {
  const programTypes = programs.map((program) => program.programType).filter(Boolean);
  const sellingPolicyManagementActive = programTypes.includes(SELLING_POLICY_MANAGEMENT);

  return {
    programs,
    programTypes,
    sellingPolicyManagement: {
      active: sellingPolicyManagementActive,
      eligible: sellingPolicyManagementActive,
      canOptIn: !sellingPolicyManagementActive,
      programType: SELLING_POLICY_MANAGEMENT,
      status: sellingPolicyManagementActive ? "active" : "not_opted_in"
    }
  };
}
