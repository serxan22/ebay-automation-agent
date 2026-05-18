import { NextResponse } from "next/server";
import { createAgentTask, runAgentTask } from "@/lib/agent/orchestrator";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const task = createAgentTask({
    userId: "system",
    taskType: "daily_product_research",
    parameters: { phase: 1 }
  });
  const result = await runAgentTask(task);

  return NextResponse.json({ ok: result.ok, task, result });
}
