# Bloc+

Phone-first web app for **Bloc City Climbing Gym** (one gym per deployment). Staff upload a 3D scan of a wall, set routes by tapping holds on the scan, and set extra routes (eliminations or new routes from an existing start). Climbers scan a QR code at a start hold, see the route in 3D, tap "I sent it", and comment. Only staff create routes; anyone can comment; staff moderate.

Live: https://krittawatcode.github.io/bloc-plus/ (GitHub Pages, deployed by `.github/workflows/deploy.yml` on push to `main`).

## Stack

React 19 + TypeScript (strict, `noUncheckedIndexedAccess`) + Vite 7, React Router 7 (**HashRouter**), TanStack Query 5, three.js, Supabase JS 2, CSS Modules + design tokens. ESLint 10, Prettier, Vitest. Node 22.

## Commands

- `npm run dev`: real backend (needs `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`)
- `npm run dev:demo`: demo backend, no Supabase needed
- **Before every commit run:** `npm run format && npm run typecheck && npm run lint && npm test && npm run build`. CI runs `format:check`, lint, test and build, and fails on any of them.

## Layout

- `src/app`: App (providers, routes), Layout (header, Climber/Staff switch, stage + panel)
- `src/domain`: pure logic and types (`routes.ts`, `grading.ts`, `practice.ts`). Put unit tests next to the file (`*.test.ts`).
- `src/data`: `Backend` interface (`backend.ts`), `SupabaseBackend`, `DemoBackend`, `createBackend`, row mappers, TanStack Query hooks (`queries.ts`)
- `src/viewer`: `WallViewer` (three.js class), hold detection (`detect.ts`), hold piece encoding (`piece.ts`), scan loading (`scan.ts`), built-in demo wall, `Stage` + hooks (`stageContext.ts`)
- `src/features/climber`, `src/features/staff`, `src/features/auth`: screens
- `src/components`: shared UI (`ui.tsx`, `RouteTag`, Toast, Dock styles)
- `src/styles/global.css`: all colour/font tokens (light + dark)
- `supabase/migrations/*.sql`: schema + row level security; `supabase/seed.sql` adds staff by email

## Backends

- `createBackend` uses Supabase when both `VITE_SUPABASE_*` vars are set and `VITE_BACKEND` isn't `demo`; otherwise demo.
- **Demo mode stores everything in the browser** (localStorage `blocplus-demo` + IndexedDB) and any login works. The header shows "· demo". Data is never shared between browsers. When a user says "my data disappeared" or "incognito shows a new gym", suspect demo mode first.
- Supabase: RLS with a `staff` table and `is_staff()`. A refused UPDATE returns 0 rows, not an error, so writes that must succeed use `.select()` and check the row count (see `saveSettings`). Storage buckets `scans` (50 MB) and `photos`; uploads are immutable (long cache).
- Any schema change = **new** migration file (the init migration has already been run on the live project), plus matching changes in `mappers.ts`, both backends, and `src/lib/database.types.ts`.

## Patterns

- 3D view: one shared `Stage`. Screens drive it with `useStageScene(spec, key, empty, enabled)`, `useViewerEvents`, and portals `<StageDock>` (bottom controls) and `<StageTools>` (top-right buttons; every 3D screen has a **Reset view** there). `useStageCollapsed(enabled)` hides the stage on phones.
- Keep hooks/contexts in `.ts` files apart from components (react-refresh rule).
- `useEffect` bodies must be blocks, not expressions that return a value (an earlier crash: "destroy_ is not a function").
- glTF vertex colours are linear; texture colours get sRGB→linear when baking hold pieces.

## Product rules

- One gym; no gym sign-up. Gym name and grading live in `settings` (row id 1).
- Grading is set by the gym. Default: Tag 0–8 + Unknown + Surprise.
- **Holds are found while setting a route**, not when a wall is added. In the route editor on a scanned wall, a tap on the scan either picks a saved hold or runs `detectHold` (`useHoldFinder`); staff check the highlight and tap Add, which saves the hold and puts it in the route. Pieces are cut from the triangles detection found (`cutTriangles`), so long holds keep their shape; after a manual − / + the circle cut (`cutPiece`) is used. Eliminations and the demo wall use the simple hold view.
- Marker holds: a small route-coloured hold bolted on a big hold/volume. Saved as Marker, linked to the hold under it; in routes the pair acts as one hold.
- **Tags** (like "No dyno"): the gym's list is `settings.tags` (staff edit it in Gym, or add one while setting a route); a route's tags are stored in `routes.rules`. Shown on route rows and the route screen.
- Route types: base (normal taped route), Elimination (cross out holds), New route (start / hand / top / feet).
- **Start hands**: each start hold can say Left, Right or Both (both hands on one hold); none means any hand. Stored per route in `routes.start_hands` (`Route.hands`), set with `pickHold()` in the editor, shown as START L / START R / START L+R labels and `startNote()` text. Extras copy the normal route's hands.
- **Feet are optional.** Default is any foot hold. Holds tagged Feet are feet-only; the tag "Marked feet only" (`STRICT_FEET`) makes it competition style. `feetNote()` gives the climber-facing text.
- The built-in **Demo wall** (called "practice" in code: `PRACTICE_WALL_ID`, wall id `practice`, hold ids `p*`, `v1–v3`) is hidden from climbers; signed-in staff see it as "Demo wall · staff only" (everyone does in demo mode).
- **Wall reset** = upload a new scan for a wall. It becomes a new wall row with the same name; the old wall gets `retired_at`/`replaced_by` and all its routes `archived`. Nothing is deleted: staff see it under Walls › Past walls with sends and comments per route. Climbers and pickers only use current walls (`isCurrentWall`).
- Comments are always shown with the route they belong to (`RouteTag`). Lists that mix routes group comments under one label per route.

## UI rules

- **Phone first.** Smallest targets: Galaxy S26 360×780 and iPhone 17 402×874. Check every UI change at 360×780 (Playwright is fine). Staff use a Samsung S26 Ultra (no LiDAR; scans come from Polycam/KIRI as `.glb`, no Draco).
- Brand colours from the Bloc City logo: violet accent `#6F35E0` (dark `#A07BFF`), cyan `--brand-cyan` `#00A9D6` (dark `#22D3FF`) for the "+" in the logo. Use tokens, never hard-coded colours. Hold role colours (start green, top amber, feet blue, off red) stay as they are.
- Plain, short UI text. Many users are Thai; comments are often in Thai.
