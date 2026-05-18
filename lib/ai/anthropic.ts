import { AiProviderError, extractJsonObject, type AiJsonRequest, type AiProvider } from "@/lib/ai/provider";

export function createAnthropicProvider(apiKey: string): AiProvider {
  return {
    name: "anthropic",
    async generateJson<T>({ messages, temperature = 0.2, maxTokens = 1400 }: AiJsonRequest): Promise<T> {
      const system = messages.find((message) => message.role === "system")?.content ?? "";
      const anthropicMessages = messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content
        }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: maxTokens,
          temperature,
          system,
          messages: anthropicMessages
        })
      });

      if (!response.ok) {
        throw new AiProviderError(`Anthropic request failed with ${response.status}.`, "anthropic");
      }

      const payload = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const content = payload.content?.find((item) => item.type === "text")?.text;

      if (!content) {
        throw new AiProviderError("Anthropic returned an empty response.", "anthropic");
      }

      return JSON.parse(extractJsonObject(content)) as T;
    }
  };
}
