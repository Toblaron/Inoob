import OpenAI from "openai";

const replitBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const replitApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const standaloneApiKey = process.env.OPENAI_API_KEY;

const apiKey = replitApiKey || standaloneApiKey;

if (!apiKey) {
  throw new Error(
    "OpenAI API key not found. In Replit: provision the OpenAI AI integration. " +
    "Self-hosted: set OPENAI_API_KEY in your .env file."
  );
}

export const openai = new OpenAI({
  apiKey,
  ...(replitBaseURL ? { baseURL: replitBaseURL } : {}),
});
