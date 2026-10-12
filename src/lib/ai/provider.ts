import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

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

function anthropic(apiKey: string): LLMProvider {
  // A small, fast model is enough for structuring short notes and playbooks.
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
  const client = new Anthropic({ apiKey, timeout: 15000, maxRetries: 1 });
  return {
    name: `anthropic:${model}`,
    async json<T>(prompt: string, { temperature = 0.2, maxTokens = 800 } = {}) {
      try {
        const msg = await client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          system: 'Reply with one JSON object only. No prose, no code fences.',
          messages: [{ role: 'user', content: prompt }],
        });
        const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        return parseJSON<T>(text);
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) throw new AIUnavailableError('rate_limited');
        // Bad key, retired model or no access: degrade to local structuring, don't error.
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError) {
          throw new AIUnavailableError('not_configured');
        }
        throw err;
      }
    },
  };
}

export function getProvider(): LLMProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AIUnavailableError('not_configured');
  return anthropic(key);
}
