/** fetch z limitem czasu, żeby wolna sieć nie zostawiała kręcącego się wskaźnika bez końca. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new Error('Serwer nie odpowiedział na czas. Sprawdź internet i spróbuj ponownie.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
