import OpenAI from "openai";

const groqApiKey = process.env.GROQ_API_KEY;

if (!groqApiKey) {
  throw new Error(
    "GROQ_API_KEY not found. Set GROQ_API_KEY in your .env file."
  );
}

export const openai = new OpenAI({
  apiKey: groqApiKey,
  baseURL: "https://api.groq.com/openai/v1",
});
