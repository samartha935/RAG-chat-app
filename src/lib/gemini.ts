import { createGoogleGenerativeAI } from "@ai-sdk/google";

export function getGeminiLanguageModel() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const google = createGoogleGenerativeAI({ apiKey });
  const modelId = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  return google.generativeAI(modelId);
}
