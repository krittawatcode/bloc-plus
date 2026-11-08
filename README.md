# Bloc+

Extra routes on your gym's walls. Staff scan a wall in 3D, tag its holds and set eliminations or new routes from the existing starts. Climbers scan a QR sticker at a start hold and see only that route's holds in 3D, log their send and leave comments. Climbers don't need an account or an app.

Built phone-first: every screen, including staff tagging, is tested at Galaxy S26 (360 × 780) and iPhone 17 (402 × 874) sizes.

## Stack

| Part          | Choice                                                                     |
| ------------- | -------------------------------------------------------------------------- |
| UI            | React 19, TypeScript (strict), React Router (hash routes)                  |
| Data fetching | TanStack Query                                                             |
| 3D            | three.js, wrapped in a small typed engine (`src/viewer`)                   |
| Styles        | CSS Modules plus design tokens in `src/styles/global.css` (light and dark) |
| Backend       | Supabase: Postgres with row level security, Auth, Storage                  |
| Tooling       | Vite, ESLint, Prettier, Vitest, GitHub Actions                             |

There is no server code of our own. The browser talks to Supabase directly, and the database rules in `supabase/migrations` decide who can do what.

## Try it in 2 minutes (no Supabase needed)

```bash
npm install
npm run dev:demo
```

Open the printed address. Demo mode keeps everything in your browser, and any email and password signs you in as staff. A fresh clone without Supabase settings also runs in demo mode.

## Project structure

```
src/
  app/            App shell: providers, routes, layout (header + 3D stage + panel)
  components/     Shared UI pieces (buttons, grade badges, toast) and shared CSS Modules
  data/           Everything about storing and loading data
    backend.ts        The Backend interface the app talks to
    supabaseBackend.ts  Supabase implementation
    demoBackend.ts      In-browser implementation (localStorage + IndexedDB)
    queries.ts          TanStack Query hooks used by pages
    mappers.ts          Database rows <-> app types
  domain/         Pure logic and types, no React or 3D: grading, routes, practice wall routes
  features/
    climber/      Start list, QR start page, route page with sends and comments
    staff/        Routes, route editor, walls and hold tagging, QR sheet, moderation, gym settings
    auth/         Staff sign-in
  viewer/         The 3D engine
    WallViewer.ts   Renderer, camera, picking, markers, preview, phone zoom behaviour
    detect.ts       Finds a hold's edge on a scan from a tap
    piece.ts        Cuts a hold out of a scan; reads and writes hold files
    scan.ts         Loads .glb scans, orientation, wall outline
    practiceWall.ts Built-in practice wall
    stage.tsx       React wrapper: one viewer for the whole visit
    stageContext.ts Hooks pages use: useStageScene, useViewerEvents, StageDock
  lib/            Small helpers: formatting, device preferences, photo resizing, DB types
supabase/
  migrations/     Database schema, rules and storage buckets
  seed.sql        Makes a user staff
```

### How a hold gets from a scan to a climber's phone

1. Staff upload a `.glb` scan. It is parsed in the browser, stored in the `scans` bucket, and a light outline of about 9,000 points is saved next to it.
2. Staff tap a hold. `detectHold` fits the flat wall around the tap, keeps what sticks out, and grows from the tap to the hold's edge. The hold is highlighted so staff can check it.
3. On save, `cutPiece` copies that hold's triangles and colours into a small binary file (`encodePiece`, usually 10–50 KB), uploaded with a one-year cache header. A `holds` row stores its centre, radius and normal.
4. A route is a JSON map of hold id → role. A climber opening a route downloads only those hold files plus the outline: a few hundred KB instead of the whole scan.

## Set up Supabase

1. Create a project at [supabase.com](https://supabase.com). A region near your gym is best (Singapore for Thailand).
2. Apply the schema, either way:
   - **CLI:** `npx supabase login`, `npx supabase link --project-ref <ref>`, then `npx supabase db push`.
   - **Dashboard:** open SQL Editor, paste `supabase/migrations/20261108000000_init.sql`, and run it.
3. In **Authentication › Sign In / Providers**, turn off **Allow new users to sign up**. Only people you add should be able to sign in.
4. In **Authentication › Users › Add user**, create each staff member with **Auto confirm**.
5. Make them staff: edit the email in `supabase/seed.sql` and run it in SQL Editor. Signing in alone is not enough, because the rules check the `staff` table.
6. Copy `.env.example` to `.env.local` and fill in the Project URL and anon key from **Project Settings › API**. Then `npm run dev`.

The anon key is meant to be public. Never put the `service_role` key in this project.

After changing migrations, regenerate the TypeScript types with `npm run db:types`.

## Deploy

**GitHub Pages:** push to `main`. In the repo, set **Settings › Pages › Source** to **GitHub Actions**, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings › Secrets and variables › Actions › Variables**. The workflow checks formatting, lints, tests, builds and deploys. Without the variables the site deploys in demo mode.

**Netlify:** import the repo. `netlify.toml` sets the build. Add the two `VITE_` variables under **Site configuration › Environment variables**.

Routes use the URL hash (`#/r/<id>`), so no rewrite rules are needed on either host.

## First run with staff

1. Open the site on a phone, tap **Staff** and sign in.
2. **Gym:** set the gym name. Grading starts as tags 0 to 8 plus Unknown and Surprise.
3. **Walls › Add a wall:** name it and upload the scan (`.glb` from Polycam or KIRI Engine, no Draco compression, up to 50 MB). Use **Stand upright** and **Turn 90°** if it isn't facing you, before tagging.
4. Tag holds with the bar on the wall view. At full-wall view the first tap zooms in. Then tap a hold, check the highlight, use − and + if needed, and save. For a small route hold bolted on a bigger one, tag the big one first, then pick **Marker** and tap the small one.
5. **Routes › New normal route:** pick Start, Hand, Top or Feet in the bar and tap holds, then **Name & grade**. Add **+ Elimination** or **+ New route** from any normal route.
6. **QR codes › Print QR sheet**, and stick each code next to its start hold.

To clean up after testing: open a route in **Routes** and use **Delete route** (a normal route takes its extras with it), or remove a whole wall under **Walls › Remove this wall**, which also removes its holds, routes and their comments. To take a route down for a while instead, **Archive** it. In demo mode, **Gym › Clear demo data** starts over.

The built-in **Practice wall** lets staff try setting routes before any scan exists. Climbers never see it (except in demo mode).

## Scripts

| Command                           | What it does                                                |
| --------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                     | Dev server using your Supabase project (`.env.local`)       |
| `npm run dev:demo`                | Dev server in demo mode                                     |
| `npm run build`                   | Type-check and build to `dist/`                             |
| `npm run build:demo`              | Build in demo mode                                          |
| `npm test`                        | Unit tests (grading, routes, hold detection, hold files)    |
| `npm run lint` / `npm run format` | ESLint / Prettier                                           |
| `npm run db:types`                | Regenerate database types from your linked Supabase project |

## Known limits

- One gym per deployment.
- Comments and sends need no login, so there is no rate limiting yet. Add Supabase rate limits or a CAPTCHA before a big launch.
- Sends are counted once per phone. Clearing browser data allows another send.
- Hold detection is tested on a mock scan. Real phone scans have rougher surfaces and thin crimps, so thresholds in `src/viewer/detect.ts` may need tuning after the first real scan.
