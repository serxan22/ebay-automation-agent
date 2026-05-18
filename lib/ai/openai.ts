import { AiProviderError, extractJsonObject, type AiJsonRequest, type AiProvider } from "@/lib/ai/provider";

interface OpenAiOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  name?: string;
}

export function createOpenAiCompatibleProvider({
  apiKey,
  baseUrl = "https://api.openai.com/v1",
  model = "gpt-4o-mini",
  name = "openai"
}: OpenAiOptions): AiProvider {
  return {
    name,
    async generateJson<T>({ messages, temperature = 0.2, maxTokens = 1400 }: AiJsonRequest): Promise<T> {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        throw new AiProviderError(`OpenAI-compatible request failed with ${response.status}.`, name);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;

      if (!content) {
        throw new AiProviderError("AI provider returned an empty response.", name);
      }

      return JSON.parse(extractJsonObject(content)) as T;
    }
  };
}
