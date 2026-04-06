# Bowsr

A small Expo (React Native) app that finds **NSW fuel stations** near you, pulls **live prices** from the NSW Government Fuel Check API, and ranks the best stops by **pump price plus the fuel you burn on the round trip** (using your tank size and L/100 km). It shows the top five options with an estimated **one-way** distance and time (API distance when available, otherwise road routing via OSRM).

## Downloads

- Android: [Install Bowsr](https://play.google.com/store/apps/details?id=com.pickradmin.bowsr)
- iOS: [Install Bowsr](https://testflight.apple.com/join/w7xkJ2g5)

## How it works (abstract)

1. **Location** — With permission, the app reads your GPS coordinates.
2. **Fuel data** — It requests OAuth credentials, then calls the **nearby prices** endpoint once for a fixed **15km** radius.
3. **Ranking** — For each candidate station it estimates **distance and time** (nearby API distance + average speed for duration, or OSRM driving directions when distance is missing). It computes **effective cost**: price per litre × (litres you need + extra fuel burned driving there and back).
4. **Settings** — You can set litres to buy, economy, fuel grade, and optional brand filters; saving refreshes live station prices and re-ranks with your current trip assumptions.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ recommended
- [npm](https://www.npmjs.com/) (bundled with Node)
- An **NSW Fuel Check API** subscription (API key + OAuth client credentials) from [API NSW](https://api.nsw.gov.au/)
- For device testing: [Expo Go](https://expo.dev/go) on a phone, or Xcode/Android Studio for simulators

## Configuration

### Local development (`.env`)

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set:

   - **`EXPO_PUBLIC_API_KEY`** — Your Fuel Check API key
   - **`EXPO_PUBLIC_BASIC_AUTH`** — The full `Authorization` value for the OAuth client-credentials request, i.e. `Basic ` followed by the Base64 encoding of `client_id:client_secret` (as returned or documented in your API NSW developer portal)

   The `EXPO_PUBLIC_` prefix is required by [Expo environment variables](https://docs.expo.dev/guides/environment-variables/) so values are available in app code. Restart `npx expo start` after changing `.env`.

### GitHub Actions and repository secrets

Use the **same variable names** as in `.env` so local and CI stay aligned.

1. In the repo: **Settings → Secrets and variables → Actions → New repository secret**
2. Add:

   | Secret name | Typical use |
   |-------------|-------------|
   | `EXPO_PUBLIC_API_KEY` | API key |
   | `EXPO_PUBLIC_BASIC_AUTH` | Full `Basic …` header string |

3. In your workflow, expose them to the job (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

   ```yaml
   env:
     EXPO_PUBLIC_API_KEY: ${{ secrets.EXPO_PUBLIC_API_KEY }}
     EXPO_PUBLIC_BASIC_AUTH: ${{ secrets.EXPO_PUBLIC_BASIC_AUTH }}
   ```

### GitHub “Environments” (optional)

For **deployment** workflows (e.g. EAS Build, previews), you can define secrets under **Settings → Environments → *environment name*** (e.g. `production`) and reference them the same way:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    environment: production
    env:
      EXPO_PUBLIC_API_KEY: ${{ secrets.EXPO_PUBLIC_API_KEY }}
      EXPO_PUBLIC_BASIC_AUTH: ${{ secrets.EXPO_PUBLIC_BASIC_AUTH }}
```

Secrets defined on an Environment override repository secrets when that job uses `environment:`.

### Security note

Anything prefixed with `EXPO_PUBLIC_` is **bundled into the client** and can be extracted from a shipped app. Treat these like **obfuscated public credentials**. For strong protection of secrets, proxy API calls through your own backend instead of calling NSW APIs directly from the device.

## Install and run

```bash
npm install
cp .env.example .env   # then edit .env
npm start
```

Then press **i** (iOS simulator), **a** (Android emulator), or scan the QR code in **Expo Go**.

Other scripts from [`package.json`](package.json):

- `npm run android` / `npm run ios` / `npm run web` — start with a specific target

## Project layout (high level)

| Path | Role |
|------|------|
| [`App.tsx`](App.tsx) | UI, location, settings, orchestration |
| [`Interface.ts`](Interface.ts) | Shared TypeScript types |
| [`constants.ts`](constants.ts) | Tunables and public env-backed API settings |
| [`fuelApiClient.ts`](fuelApiClient.ts) | OAuth + nearby fuel API + response normalization |
| [`routingClient.ts`](routingClient.ts) | OSRM driving distance/time fallback |
| [`calculations.ts`](calculations.ts) | Ranking and trip cost math |
| [`utils.ts`](utils.ts) | Small helpers (normalization, errors) |

## License

Private project unless you add a license file.
