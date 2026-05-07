import { createGoogleGenerativeAI } from "@ai-sdk/google";

export function getGeminiLanguageModel() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const google = createGoogleGenerativeAI({ apiKey });
  const configuredModel = process.env.GEMINI_MODEL?.trim();
  /** Some AI Studio projects report zero free quota on 2.0 Flash; keep the prototype on 2.5 Flash by default. */
  const modelId =
    !configuredModel || configuredModel === "gemini-2.0-flash"
      ? "gemini-2.5-flash"
      : configuredModel;
  return google.generativeAI(modelId);
}
