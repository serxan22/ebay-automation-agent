import { createOpenAiCompatibleProvider } from "@/lib/ai/openai";

export function createGroqProvider(apiKey: string) {
  return createOpenAiCompatibleProvider({
    apiKey,
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    name: "groq"
  });
}
