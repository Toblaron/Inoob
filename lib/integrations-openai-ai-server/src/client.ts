import OpenAI from "openai";

const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.groq.com/openai/v1";
const replitApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const standaloneApiKey = process.env.OPENAI_API_KEY;

const apiKey = replitApiKey || standaloneApiKey;

if (!apiKey) {
  throw new Error(
    "API key not found. Set OPENAI_API_KEY in your .env file " +
    "(e.g. gsk_... for Groq, AIza... for Gemini, sk-... for OpenAI)."
  );
}

export const openai = new OpenAI({
  apiKey,
  baseURL,
});
