import Anthropic from '@anthropic-ai/sdk';

/**
 * Pośrednik między aplikacją a Claude API. Trzyma klucz API po stronie serwera,
 * żeby nie trafił do aplikacji na telefonie.
 *
 * POST / {
 *   image: <base64 JPEG>, mediaType: 'image/jpeg', hint?: string,
 *   foodGrams?: number,                              // zważona masa samego jedzenia
 *   dish?: { name: string, diameterCm: number | null } // naczynie na zdjęciu
 * }
 *   -> { items: [...], notes: string }
 *
 * POST /suggest { query: string }   // np. „banan”, „jogurt naturalny”
 *   -> { options: [{ name, portion, grams, kcal_per_100g, ... }] }
 */

interface Env {
  ANTHROPIC_API_KEY: string;
  /** Wspólny sekret z EXPO_PUBLIC_APP_TOKEN w aplikacji, żeby obcy nie korzystali z Twojego klucza. */
  APP_TOKEN?: string;
}

type Body = {
  image?: string;
  mediaType?: string;
  hint?: string;
  foodGrams?: number;
  dish?: { name?: string; diameterCm?: number | null };
  query?: string;
};

const MAX_IMAGE_BASE64 = 5_000_000;

const SYSTEM_PROMPT = `Jesteś dietetykiem, który na podstawie zdjęcia posiłku szacuje jego wartości odżywcze.
Rozpoznaj każdy osobny składnik lub potrawę widoczną na zdjęciu. Dla każdego podaj polską nazwę,
szacowaną masę porcji w gramach oraz wartości na 100 g (kcal, białko, tłuszcz, węglowodany w gramach),
oparte na typowych wartościach z tabel składu żywności. Masę porcji oceniaj po wielkości talerza,
sztućców i innych przedmiotów w kadrze. Uwzględnij widoczne dodatki, np. olej, sos czy masło.
Jeśli użytkownik dopisał wskazówkę, traktuj ją jako ważniejszą od samego zdjęcia.
Jeśli użytkownik podał zważoną masę jedzenia, gramatury wszystkich pozycji muszą sumować się do tej masy;
Twoim zadaniem jest wtedy rozdzielić ją między składniki na podstawie zdjęcia.
Jeśli podał średnicę naczynia, użyj jej jako skali do oceny objętości.
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

const SUGGEST_PROMPT = `Jesteś dietetykiem. Użytkownik wpisuje nazwę produktu lub potrawy, żeby dodać ją do dziennika kalorii.
Zaproponuj od 3 do 6 typowych porcji do wyboru, od najczęstszej. Każda opcja to polska nazwa produktu,
opis porcji zrozumiały w kuchni (np. „1 średni banan”, „szklanka 250 ml”, „kubeczek 150 g”, „łyżka”),
masa porcji w gramach (dla płynów przelicz ml na gramy według gęstości) i wartości na 100 g
(kcal, białko, tłuszcz, węglowodany w gramach) według typowych tabel składu żywności.
Jeśli nazwa jest ogólna (np. „jogurt”), pokaż najpopularniejsze odmiany, np. naturalny, grecki, owocowy.
Popraw oczywiste literówki. Jeśli wpis nie jest jedzeniem ani napojem, zwróć pustą listę.`;

const SUGGEST_SCHEMA = {
  type: 'object',
  properties: {
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          portion: { type: 'string' },
          grams: { type: 'number' },
          kcal_per_100g: { type: 'number' },
          protein_per_100g: { type: 'number' },
          fat_per_100g: { type: 'number' },
          carbs_per_100g: { type: 'number' },
        },
        required: ['name', 'portion', 'grams', 'kcal_per_100g', 'protein_per_100g', 'fat_per_100g', 'carbs_per_100g'],
        additionalProperties: false,
      },
    },
  },
  required: ['options'],
  additionalProperties: false,
};

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Składa dane od użytkownika w tekst dla modelu, odrzucając wartości spoza rozsądnego zakresu. */
function describeContext(body: Body): string {
  const lines: string[] = [];
  const hint = body.hint?.trim().slice(0, 500);
  if (hint) lines.push(`Wskazówka od użytkownika: ${hint}`);
  if (isNum(body.foodGrams, 1, 5000)) lines.push(`Zważona masa samego jedzenia (bez naczynia): ${Math.round(body.foodGrams)} g.`);
  const dishName = body.dish?.name?.trim().slice(0, 60);
  if (dishName) {
    const d = body.dish?.diameterCm;
    lines.push(`Naczynie na zdjęciu: ${dishName}${isNum(d, 1, 80) ? `, średnica ${d} cm` : ''}.`);
  }
  return lines.join('\n');
}

type Content = Anthropic.Beta.BetaContentBlockParam[];

/** Jedno zapytanie do Claude ze strukturalną odpowiedzią JSON. */
async function ask(env: Env, system: string, schema: Record<string, unknown>, content: Content): Promise<Response> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Proste rozpoznanie: niski wysiłek wystarcza i skraca czas odpowiedzi.
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      return json({ error: 'Model odmówił odpowiedzi' }, 422);
    }
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ error: 'Pusta odpowiedź modelu' }, 502);
    return json(JSON.parse(text.text));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'Limit zapytań, spróbuj za chwilę' }, 429);
    if (err instanceof Anthropic.APIError) return json({ error: `Claude API: ${err.message}` }, 502);
    throw err;
  }
}

function analyzePhoto(env: Env, body: Body): Promise<Response> | Response {
  const mediaType = (body.mediaType ?? 'image/jpeg') as MediaType;
  if (!body.image || body.image.length > MAX_IMAGE_BASE64 || !MEDIA_TYPES.includes(mediaType)) {
    return json({ error: 'Brak zdjęcia, zły format lub zdjęcie jest za duże' }, 400);
  }
  return ask(env, SYSTEM_PROMPT, OUTPUT_SCHEMA, [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: body.image } },
    { type: 'text', text: describeContext(body) || 'Oszacuj ten posiłek.' },
  ]);
}

function suggest(env: Env, body: Body): Promise<Response> | Response {
  const query = body.query?.trim().slice(0, 100);
  if (!query) return json({ error: 'Brak zapytania' }, 400);
  return ask(env, SUGGEST_PROMPT, SUGGEST_SCHEMA, [{ type: 'text', text: query }]);
}

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

    const path = new URL(request.url).pathname;
    if (path === '/suggest') return suggest(env, body);
    return analyzePhoto(env, body);
  },
};
