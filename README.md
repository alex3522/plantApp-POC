# plantApp

A personal plant care tracker. Add the plants you own, build out their individual profiles (location, pot, soil, window direction), and generate a personalised AI care schedule for each one. Upcoming tasks surface on the home page so you always know what needs attention.

**Live site:** https://alex3522.github.io/plantApp-POC/

---

## What it does

- **Plant library** — browse or search 10 common houseplants with detailed care guides
- **My plants** — add plants to your collection and give them nicknames
- **Plant profiles** — record soil type, pot size, pot material, age, health, last repotted date, distance to window, window direction, and light obstruction
- **Location & sunlight** — use browser geolocation to determine your location, then calculate estimated daily sunlight hours using real weather data (Open-Meteo) combined with your window conditions
- **AI care plans** — send a plant's profile to Claude (Haiku) via a Supabase Edge Function; it returns a personalised watering, feeding, misting, pruning, and repotting schedule written specifically for that plant's conditions. Rate limited to once per 24 hours per plant
- **Care schedule** — upcoming tasks displayed on the home page with due dates; tick them off to log the action and advance the next due date
- **Care history** — every completed task is logged to the database and shown as a timeline on each plant's page
- **Search** — search by plant name, species, or your own nicknames; shows your plants first with a "yours" badge

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (ES modules) |
| Font | JetBrains Mono (body), Fraunces (logo) |
| Auth & database | Supabase (Postgres + Auth) |
| Edge function | Supabase Edge Functions (Deno/TypeScript) |
| AI | Anthropic Claude API (`claude-haiku-4-5`) |
| Geocoding | Nominatim (OpenStreetMap) — no API key required |
| Weather | Open-Meteo — no API key required |
| Hosting | GitHub Pages (static) |
| Local dev | live-server |

---

## Project structure

```
plantApp/
├── index.html          # Home page — hero, search, upcoming care, my plants
├── browse.html         # Browse all plants in the library
├── plant.html          # Individual plant care guide (generic)
├── myplant.html        # Individual user plant page (profile, schedule, history)
├── manage.html         # Manage / remove plants from collection
├── schedule.html       # Full upcoming care schedule
│
├── css/
│   └── style.css       # Single stylesheet for the entire app
│
├── js/
│   ├── app.js          # Home page logic (plants grid, upcoming care, hero text)
│   ├── auth.js         # Auth modal, sign in / sign up / sign out, nav state
│   ├── supabase.js     # Supabase client initialisation
│   ├── search.js       # Search bar and dropdown (regular script, not module)
│   ├── myplant.js      # Plant page — profile, care plan, calendar, history, TOC
│   ├── manage.js       # Manage page logic
│   └── browse.js       # Browse page logic
│
├── data/
│   └── plants.json     # Plant library — 10 plants with full care data
│
├── supabase/
│   └── functions/
│       └── generate-care-plan/
│           └── index.ts    # Edge function — calls Claude API, writes schedule to DB
│
├── assets/             # Static assets (images etc.)
├── favicon.svg         # SVG favicon
└── package.json        # Dev dependency: live-server
```

---

## Database schema

Three tables, all with Row Level Security enabled. Users can only read and write their own data.

### `user_plants`
Stores each plant a user has added to their collection.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | FK → auth.users |
| `plant_id` | text | References an id in plants.json |
| `nickname` | text | User-given name |
| `location` | text | Free text location description |
| `room` | text | Room in the home |
| `soil_type` | text | e.g. "Standard potting mix" |
| `age` | text | e.g. "4 years" |
| `health` | text | e.g. "Healthy", "Wilting" |
| `pot_size` | text | e.g. "Large (25–35cm)" |
| `pot_material` | text | e.g. "Terracotta" |
| `last_repotted` | date | Month/year last repotted |
| `distance_to_window` | text | e.g. "1m", "Touching" |
| `window_facing` | text | Compass direction e.g. "SE" |
| `light_obstruction` | text | e.g. "None", "Heavy trees" |
| `lat` | numeric | From browser geolocation |
| `lng` | numeric | From browser geolocation |
| `care_summary` | text | AI-generated care insight text |
| `care_plan_generated_at` | timestamptz | Timestamp of last AI generation (used for 24h rate limit) |
| `added_at` | timestamptz | When the plant was added |

### `care_schedule`
One row per care task per plant. Replaced entirely on each AI care plan generation.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_plant_id` | uuid | FK → user_plants |
| `user_id` | uuid | FK → auth.users |
| `care_type` | text | One of: `water`, `feed`, `mist`, `repot`, `prune` |
| `frequency_days` | integer | How often to repeat, in days |
| `next_due` | date | Date the task is next due |

### `care_logs`
Append-only log of every completed care action.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_plant_id` | uuid | FK → user_plants |
| `user_id` | uuid | FK → auth.users |
| `care_type` | text | One of: `water`, `feed`, `mist`, `repot`, `prune` |
| `performed_at` | timestamptz | When the task was marked done |
| `notes` | text | Optional notes (reserved for future use) |

### Database function

```sql
-- Returns the top N most-added plants across all users (used for Popular Plants on homepage)
CREATE OR REPLACE FUNCTION get_popular_plants(limit_count int DEFAULT 5)
RETURNS TABLE(plant_id text, count bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT plant_id, COUNT(*) as count
  FROM user_plants
  GROUP BY plant_id
  ORDER BY count DESC
  LIMIT limit_count;
$$;

GRANT EXECUTE ON FUNCTION get_popular_plants TO anon;
```

---

## Supabase Edge Function

### `generate-care-plan`

Called from `myplant.js` when the user clicks "Generate care plan".

**What it does:**
1. Checks `care_plan_generated_at` on the plant — rejects with 429 if within 24 hours
2. Calls the Claude API (`claude-haiku-4-5`) with a prompt built from the plant's profile, using forced tool use to guarantee structured JSON output
3. Deletes the existing `care_schedule` rows for that plant
4. Inserts the new tasks returned by Claude
5. Updates `care_summary` and `care_plan_generated_at` on the `user_plants` row
6. Returns `{ tasks, summary }` to the client

**Environment variables required (set as Supabase secrets):**
- `ANTHROPIC_API_KEY` — Claude API key
- `SUPABASE_URL` — auto-provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — auto-provided by Supabase

**Deploy:**
```bash
npx supabase functions deploy generate-care-plan --no-verify-jwt
```

---

## Local development

**Prerequisites:** Node.js, npm, Supabase CLI

```bash
# Install dependencies
npm install

# Start local dev server at http://localhost:3000
npm start
```

The app talks directly to the live Supabase project — there is no local database setup needed for development.

---

## Deployment

The app is a static site with no build step. GitHub Pages serves it directly from the `master` branch root.

Any `git push` to `master` automatically redeploys via GitHub Pages (usually live within 60 seconds).

**Required Supabase configuration:**
- Authentication → URL Configuration → Site URL: `https://alex3522.github.io/plantApp-POC/`
- Authentication → URL Configuration → Redirect URLs: `https://alex3522.github.io/plantApp-POC/`

---

## Adding plants to the library

Plants are defined in `data/plants.json`. Each entry requires:

```json
{
  "id": "unique-kebab-case-id",
  "name": "Display Name",
  "species": "Latin name",
  "icon": "🌿",
  "care": {
    "watering": { "frequency": "", "frequencyNote": "", "amount": "", "seasonal": "", "seasonalNote": "" },
    "feeding":  { "frequency": "", "frequencyNote": "", "fertiliser": "", "winter": "", "winterNote": "" },
    "light":    { "ideal": "", "placement": "", "placementNote": "", "avoid": "", "avoidNote": "" },
    "environment": { "temperature": "", "temperatureNote": "", "humidity": "", "humidityNote": "" }
  },
  "tips": ["tip 1", "tip 2", "tip 3", "tip 4"]
}
```

After adding a plant to `plants.json`, also add it to the popular plants fallback in `index.html` if desired.
