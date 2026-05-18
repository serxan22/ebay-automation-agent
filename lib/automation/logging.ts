import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationLogLevel } from "@/lib/types";

export async function logAutomationEvent({
  supabase,
  userId,
  level,
  module,
  message,
  metadata = {}
}: {
  supabase: SupabaseClient;
  userId: string;
  level: AutomationLogLevel;
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("automation_logs").insert({
    user_id: userId,
    level,
    module,
    message,
    metadata_json: metadata
  });

  if (error) {
    console.error("Failed to write automation log", error);
  }
}
