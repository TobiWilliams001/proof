import 'server-only';

/**
 * Provider-agnostic LLM boundary (brief §8). Routes never know which provider
 * answered. Before real users' data flows through here, use a paid, no-training API.
 */
export interface LLMProvider {
  name: string;
  json<T>(prompt: string, opts?: { temperature?: number; maxTokens?: number }): Promise<T>;
}

export class AIUnavailableError extends Error {}

function parseJSON<T>(text: string): T {
  const cleaned = text.replace(/```json|```/g, '').trim();
  // Models occasionally wrap JSON in a sentence; take the outermost object.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned) as T;
}

function gemini(apiKey: string): LLMProvider {
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  return {
    name: `gemini:${model}`,
    async json<T>(prompt: string, { temperature = 0.2, maxTokens = 800 } = {}) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          // Header rather than query string keeps the key out of access logs.
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (res.status === 429) throw new AIUnavailableError('rate_limited');
      // Retired model or a project without access: degrade to local structuring, don't error.
      if (res.status === 403 || res.status === 404) throw new AIUnavailableError('not_configured');
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const body = await res.json();
      return parseJSON<T>(body.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    },
  };
}

export function getProvider(): LLMProvider {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIUnavailableError('not_configured');
  return gemini(key);
}
