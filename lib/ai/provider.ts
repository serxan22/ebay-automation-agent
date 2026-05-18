export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiJsonRequest {
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AiProvider {
  name: string;
  generateJson<T>(request: AiJsonRequest): Promise<T>;
}

export class AiProviderError extends Error {
  constructor(message: string, public readonly provider: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function extractJsonObject(content: string) {
  const trimmed = content.trim();

  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AI response did not contain a JSON object.");
  }

  return match[0];
}
