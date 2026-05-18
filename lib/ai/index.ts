import { createAnthropicProvider } from "@/lib/ai/anthropic";
import { createGroqProvider } from "@/lib/ai/groq";
import { createOpenAiCompatibleProvider } from "@/lib/ai/openai";
import type { AiProvider } from "@/lib/ai/provider";

export function getConfiguredAiProvider(): AiProvider | null {
  const provider = process.env.AI_PROVIDER ?? "openai";

  if (provider === "groq" && process.env.GROQ_API_KEY) {
    return createGroqProvider(process.env.GROQ_API_KEY);
  }

  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return createAnthropicProvider(process.env.ANTHROPIC_API_KEY);
  }

  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return createOpenAiCompatibleProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      name: "openai"
    });
  }

  if (process.env.GROQ_API_KEY) {
    return createGroqProvider(process.env.GROQ_API_KEY);
  }

  if (process.env.OPENAI_API_KEY) {
    return createOpenAiCompatibleProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      name: "openai"
    });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return createAnthropicProvider(process.env.ANTHROPIC_API_KEY);
  }

  return null;
}
