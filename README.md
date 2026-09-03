# Cotton Risk Management — Cloudflare + Notion (clean architecture)

## Storage rule

**Notion is the only persistent store for confidential cotton-specific data.** The GitHub repository contains application code only.

Notion contains only:
- cotton production values (year, geography, planted area, yield)
- cotton growing-season information
- cotton-specific pest / issue notes and sources

The repository intentionally contains **no** CSV production dataset, GeoJSON/TopoJSON, county/district/municipality polygons, climate grids, or API secrets.

## Administrative boundaries

Administrative polygons are **not stored anywhere in the project**. Cloudflare fetches them at runtime from open public boundary services and returns only polygons that can be uniquely matched to the cotton records for the requested year.

- United States counties: U.S. Census TIGERweb (current Counties layer)
- Other countries: geoBoundaries `gbOpen`, using simplified GeoJSON

The application joins boundaries to cotton records at runtime. For non-US countries it deliberately refuses ambiguous duplicate-name matches rather than guessing the wrong administrative unit.

## Architecture

Browser → Cloudflare Pages / Functions → Notion (cotton data)

Cloudflare Functions also proxy:
- live open administrative boundaries
- Open-Meteo weather/climate services
- EVERLOOP / WeatherTrade hazard API

No Notion or hazard credentials are sent to the browser.

## Required Notion database properties

Import the clean `Cotton_Production_Notion.csv` separately into Notion. Map the columns as:

- `Name` → Title
- `Record Type` → Text
- `Geography ID` → Text
- `Country` → Text
- `State / Region` → Text
- `Local Area` → Text
- `Geography Type` → Text
- `Year` → Number
- `Planted Area (ha)` → Number
- `Yield (t/ha)` → Number
- `Growing Season Start` → Text
- `Growing Season End` → Text
- `Cotton Pest / Issue` → Text
- `Source` → Text
- `Source URL` → URL or Text

Connect the `Cotton Risk API` Notion integration to this database/data source.

## Cloudflare secrets

In Cloudflare Pages → Settings → Variables and Secrets, add:

- `NOTION_TOKEN`
- `NOTION_DATA_SOURCE_ID`
- `HAZARD_API_KEY`
- `HAZARD_API_EMAIL`
- `HAZARD_API_URL` (the upstream hazard endpoint; keeping it in Cloudflare prevents the public GitHub code from exposing that endpoint)

Use encrypted Secrets for credentials.

## Cloudflare Pages deployment

Connect the GitHub repository and use:

- Framework preset: **None**
- Build command: leave blank
- Build output directory: `public`
- Root directory: leave blank

The `functions/` directory must remain at repository root.

## API routes

- `/api/health`
- `/api/map?year=2025` — cotton records from Notion + live open boundaries
- `/api/cotton/profile?id=13001` — annual cotton series for one geography
- `/api/cotton/context` — growing seasons and cotton-specific issues
- `/api/weather/*` — Cloudflare proxy to Open-Meteo
- `/api/hazards` — secure Cloudflare proxy to the EVERLOOP/WeatherTrade API

## Security check before every public push

```bash
npm run check
```

This fails if a `data/` directory, CSV/GeoJSON/TopoJSON dataset, or obvious secret is present.

## Important

Do not copy the clean Notion CSV into this repository. Keep it outside GitHub and import it directly into Notion.
