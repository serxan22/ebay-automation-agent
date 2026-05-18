import { generateListing } from "@/lib/ai/generate-listing";
import { analyzeProduct } from "@/lib/products/analyze-product";
import { createListingDraft } from "@/lib/products/create-listing-draft";
import { generateDailyReport } from "@/lib/reports/generate-report";
import type {
  AgentTaskResult,
  AutomationSettings,
  ListingDraft,
  ProductAnalysis,
  Supplier,
  SupplierProduct
} from "@/lib/types";

export type AgentTaskType =
  | "daily_product_research"
  | "analyze_supplier_products"
  | "generate_listing_drafts"
  | "publish_approved_listings"
  | "auto_publish_safe_products"
  | "sync_stock"
  | "sync_prices"
  | "generate_daily_report"
  | "telegram_requested_task";

export interface AgentTask {
  id: string;
  userId: string;
  taskType: AgentTaskType;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  parameters: Record<string, unknown>;
  createdAt: string;
}

export interface ListingPipelineInput {
  userId: string;
  settings: AutomationSettings;
  products: SupplierProduct[];
  suppliers?: Supplier[];
  maxProducts?: number;
}

export interface ListingPipelineResult {
  analyses: ProductAnalysis[];
  drafts: ListingDraft[];
  report: AgentTaskResult;
}

export function createAgentTask({
  userId,
  taskType,
  parameters = {}
}: {
  userId: string;
  taskType: AgentTaskType;
  parameters?: Record<string, unknown>;
}): AgentTask {
  return {
    id: crypto.randomUUID(),
    userId,
    taskType,
    status: "queued",
    parameters,
    createdAt: new Date().toISOString()
  };
}

export async function runAgentTask(task: AgentTask, input?: Partial<ListingPipelineInput>): Promise<AgentTaskResult> {
  try {
    if (task.taskType === "generate_daily_report") {
      return generateReport();
    }

    if (task.taskType === "analyze_supplier_products" && input?.products && input.settings && input.userId) {
      const result = await runProductResearch({
        userId: input.userId,
        settings: input.settings,
        products: input.products,
        suppliers: input.suppliers,
        maxProducts: input.maxProducts
      });
      return result.report;
    }

    return {
      ok: true,
      message: `${task.taskType} is queued. Phase 1 stores safe drafts and does not publish to eBay yet.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Agent task failed."
    };
  }
}

export async function runDailyAutomation(input: ListingPipelineInput): Promise<ListingPipelineResult> {
  return runListingPipeline({
    ...input,
    maxProducts: Math.min(input.maxProducts ?? 50, input.settings.dailyListingLimit * 4)
  });
}

export async function runProductResearch(input: ListingPipelineInput): Promise<ListingPipelineResult> {
  return runListingPipeline(input);
}

export async function runListingPipeline({
  settings,
  products,
  suppliers = [],
  maxProducts
}: ListingPipelineInput): Promise<ListingPipelineResult> {
  const selectedProducts = products.slice(0, maxProducts ?? products.length);
  const analyses: ProductAnalysis[] = [];
  const drafts: ListingDraft[] = [];

  for (const product of selectedProducts) {
    const supplier = suppliers.find((item) => item.id === product.supplierId) ?? null;
    const analysis = analyzeProduct({ product, settings, supplier });
    analyses.push(analysis);

    if (!analysis.approvedForListing) {
      continue;
    }

    const generatedListing = await generateListing({ product, analysis });
    const draft = createListingDraft({
      product,
      analysis,
      generatedListing,
      settings,
      optimizedImageUrls: product.imageUrls
    });
    drafts.push(draft);
  }

  return {
    analyses,
    drafts,
    report: generateDailyReport({
      scanned: selectedProducts.length,
      analyses,
      draftsCreated: drafts.length,
      listed: 0,
      failed: 0
    })
  };
}

export async function runStockSync(): Promise<AgentTaskResult> {
  return {
    ok: true,
    message: "Stock sync skeleton is ready. Supplier API connectors are scheduled for Phase 5."
  };
}

export async function runPriceSync(): Promise<AgentTaskResult> {
  return {
    ok: true,
    message: "Price sync skeleton is ready. It will respect minimum margin and update cadence rules."
  };
}

export function generateReport(): AgentTaskResult {
  return generateDailyReport({
    scanned: 0,
    analyses: [],
    draftsCreated: 0,
    listed: 0,
    failed: 0
  });
}

export async function sendTelegramReport(): Promise<AgentTaskResult> {
  return {
    ok: true,
    message: "Telegram report delivery is scaffolded. Configure TELEGRAM_BOT_TOKEN and connect a chat to send reports."
  };
}
