# Kalorie

Prywatna aplikacja na telefon (Android, iOS) do liczenia kalorii i makroskładników.
Posiłek dodajesz ze zdjęcia, z bazy produktów, skanując kod kreskowy albo ręcznie.

## Co potrafi

- **Dziś**: suma kalorii, białka, tłuszczu i węglowodanów, postęp względem dziennego celu, przeglądanie poprzednich dni. Przytrzymanie pozycji ją usuwa.
- **Dodaj**:
  - zdjęcie posiłku (aparat lub galeria), które Claude rozbija na składniki z szacowaną gramaturą i wartościami na 100 g; wszystko można poprawić przed zapisem, a krótka wskazówka (np. „smażone na maśle”) poprawia wynik,
  - wyszukiwarka i skaner kodów kreskowych z bazy [Open Food Facts](https://world.openfoodfacts.org),
  - ręczny wpis,
  - szybkie ponowne dodanie ostatnio jedzonych produktów.
- **Historia**: ostatnie 14 dni i średnie z 7 oraz 14 dni.
- **Ustawienia**: dzienny cel kalorii.

Wszystkie wpisy są zapisywane tylko na telefonie (SQLite). Na zewnątrz trafiają jedynie zapytania do Open Food Facts i zdjęcia do analizy.

## Budowa

| Część | Technologia |
|---|---|
| Aplikacja | Expo SDK 58, React Native, TypeScript, Expo Router (`src/app`) |
| Dane | `expo-sqlite`, schemat i zapytania w `src/db/database.ts` |
| Baza produktów | Open Food Facts (`src/lib/openfoodfacts.ts`) |
| Analiza zdjęć | Cloudflare Worker (`worker/`) wywołujący Claude API; aplikacja zmniejsza zdjęcie do 1024 px i wysyła je do workera (`src/lib/analyze-photo.ts`) |

Klucz Claude API jest tylko w workerze, nigdy w aplikacji.

## Uruchomienie na telefonie z Androidem

Potrzebujesz Node.js 20+ na komputerze.

```bash
npm install
cp .env.example .env    # uzupełnij po wdrożeniu workera (niżej)
npx expo start
```

Aparat, galeria i SQLite są wbudowane w aplikację **Expo Go**: zainstaluj ją ze Sklepu Play i zeskanuj kod QR z terminala. Telefon i komputer muszą być w tej samej sieci Wi-Fi (albo uruchom `npx expo start --tunnel`).

### Własny plik APK (bez komputera po instalacji)

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

Przy pierwszym uruchomieniu EAS zapyta o utworzenie `eas.json`. W profilu `preview` ustaw `"android": { "buildType": "apk" }`, a zmienne z `.env` dodaj jako zmienne środowiskowe EAS. Darmowe konto Expo wystarczy.

## Analiza zdjęć (worker)

Potrzebujesz darmowego konta [Cloudflare](https://dash.cloudflare.com) i klucza API z [Claude Console](https://platform.claude.com).

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APP_TOKEN        # dowolny długi losowy ciąg
npx wrangler deploy
```

Adres z `wrangler deploy` wpisz do `EXPO_PUBLIC_ANALYZE_URL` w `.env`, a ten sam `APP_TOKEN` do `EXPO_PUBLIC_APP_TOKEN`. Po zmianie `.env` uruchom `npx expo start` ponownie.

Worker używa modelu `claude-opus-5-5` z niskim poziomem wysiłku. Jedno zdjęcie to kilka do kilkunastu groszy.

`APP_TOKEN` trafia do aplikacji, więc chroni tylko przed przypadkowymi wywołaniami. Przy udostępnianiu aplikacji innym osobom trzeba będzie dodać prawdziwe logowanie.

## Sprawdzanie kodu

```bash
npm run typecheck
npm run lint
cd worker && npm run typecheck
```
