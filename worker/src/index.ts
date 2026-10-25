import Anthropic from '@anthropic-ai/sdk';

/**
 * Pośrednik między aplikacją a Claude API. Trzyma klucz API po stronie serwera,
 * żeby nie trafił do aplikacji na telefonie.
 *
 * POST / { image: <base64 JPEG>, mediaType: 'image/jpeg', hint?: string }
 *   -> { items: [...], notes: string }
 */

interface Env {
  ANTHROPIC_API_KEY: string;
  /** Wspólny sekret z EXPO_PUBLIC_APP_TOKEN w aplikacji, żeby obcy nie korzystali z Twojego klucza. */
  APP_TOKEN?: string;
}

type Body = { image?: string; mediaType?: string; hint?: string };

const MAX_IMAGE_BASE64 = 5_000_000;

const SYSTEM_PROMPT = `Jesteś dietetykiem, który na podstawie zdjęcia posiłku szacuje jego wartości odżywcze.
Rozpoznaj każdy osobny składnik lub potrawę widoczną na zdjęciu. Dla każdego podaj polską nazwę,
szacowaną masę porcji w gramach oraz wartości na 100 g (kcal, białko, tłuszcz, węglowodany w gramach),
oparte na typowych wartościach z tabel składu żywności. Masę porcji oceniaj po wielkości talerza,
sztućców i innych przedmiotów w kadrze. Uwzględnij widoczne dodatki, np. olej, sos czy masło.
Jeśli użytkownik dopisał wskazówkę, traktuj ją jako ważniejszą od samego zdjęcia.
W polu notes napisz krótko po polsku, czego nie jesteś pewien (np. ukryty tłuszcz, nietypowa porcja).
Jeśli na zdjęciu nie ma jedzenia, zwróć pustą listę items i wyjaśnij to w notes.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal_per_100g: { type: 'number' },
          protein_per_100g: { type: 'number' },
          fat_per_100g: { type: 'number' },
          carbs_per_100g: { type: 'number' },
        },
        required: ['name', 'grams', 'kcal_per_100g', 'protein_per_100g', 'fat_per_100g', 'carbs_per_100g'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['items', 'notes'],
  additionalProperties: false,
};

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'Użyj POST' }, 405);
    if (env.APP_TOKEN && request.headers.get('X-App-Token') !== env.APP_TOKEN) {
      return json({ error: 'Nieprawidłowy token' }, 401);
    }

    let body: Body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Nieprawidłowy JSON' }, 400);
    }
    const mediaType = (body.mediaType ?? 'image/jpeg') as MediaType;
    if (!body.image || body.image.length > MAX_IMAGE_BASE64 || !MEDIA_TYPES.includes(mediaType)) {
      return json({ error: 'Brak zdjęcia, zły format lub zdjęcie jest za duże' }, 400);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const hint = body.hint?.trim().slice(0, 500);

    try {
      const response = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        // Proste rozpoznanie: niski wysiłek wystarcza i skraca czas odpowiedzi.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: body.image } },
              { type: 'text', text: hint ? `Wskazówka od użytkownika: ${hint}` : 'Oszacuj ten posiłek.' },
            ],
          },
        ],
      });

      if (response.stop_reason === 'refusal') {
        return json({ error: 'Model odmówił analizy tego zdjęcia' }, 422);
      }
      const text = response.content.find((b) => b.type === 'text');
      if (!text || text.type !== 'text') return json({ error: 'Pusta odpowiedź modelu' }, 502);
      return json(JSON.parse(text.text));
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json({ error: 'Limit zapytań, spróbuj za chwilę' }, 429);
      if (err instanceof Anthropic.APIError) return json({ error: `Claude API: ${err.message}` }, 502);
      throw err;
    }
  },
};
