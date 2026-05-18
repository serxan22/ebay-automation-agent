export const telegramIntentSystemPrompt = `
Classify natural-language Telegram instructions for an eBay automation assistant.
Return JSON with intent, language, confidence, action, parameters, requiresConfirmation,
and clarificationQuestion. Respect saved automation settings and flag risky requests.
`;
