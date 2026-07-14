# Project Flow Planner

Gantt-chart project planner — TanStack Start + React 19 + Vite 8 + Tailwind v4 + shadcn/ui. Package manager: npm (also has bun lockfile).

> **Precedence**: `.github/copilot-instructions.md` is the authoritative instruction set. If this file and copilot-instructions conflict, copilot-instructions wins. This file is a compact fact sheet; copilot-instructions contains the full rules, policies, and workflow.

## Commands

| Command                     | What it does               |
| --------------------------- | -------------------------- |
| `npm start` / `npm run dev` | Dev server (port 8080)     |
| `npm run build`             | Production build           |
| `npm test`                  | Vitest (jsdom, single run) |
| `npm run test:watch`        | Vitest watch mode          |
| `npm run lint`              | ESLint                     |
| `npm run format`            | Prettier write             |
| `npx tsc --noEmit`          | Typecheck (no npm script)  |

Validation order: `npm run lint` → `npx tsc --noEmit` → `npm test`. All green before done.

## Testing

- Test files live in `__tests__/` directories next to the modules they test.
- Stores expose `_resetForTesting()` and `getTasks()` helpers for test isolation.
- Server functions are mocked with `vi.mock()` in store tests.
- Setup: `src/test-setup.ts` (clears localStorage before each, restores mocks after).
- Pure logic lives in `src/lib/gantt-utils.ts` — always extract testable functions there.

## Architecture

### State — client-side only, no database

Two stores in `src/lib/`, both using `useSyncExternalStore` + localStorage + server sync:

| Store    | File                | localStorage key    | Interface         |
| -------- | ------------------- | ------------------- | ----------------- |
| Tasks    | `gantt-store.ts`    | `gantt-tasks-v1`    | `Task`            |
| Settings | `settings-store.ts` | `gantt-settings-v1` | `ProjectSettings` |

Lifecycle: hydrate from localStorage → fetch from server (`getProjectData`) → on mutation, persist to localStorage + fire `mergeProjectData` async.

**Race condition note**: each store sends only its own slice (`{ tasks }` or `{ settings }`). The server merges, so concurrent writes don't clobber. Do NOT GET before POST in stores — that creates a race.

### Task model

```ts
interface Task {
  id: string;
  parentId: string | null; // null = top-level
  title: string;
  assignee: string;
  startDate: string; // YYYY-MM-DD (planned)
  endDate: string; // planned
  actualStartDate?: string; // real
  actualEndDate?: string; // real
  progress: number; // 0..100
  block: "none" | "partial" | "total";
  blockReason?: string;
  comments: Comment[];
  createdAt: string;
}
```

`project-data.json` (project root): `{ "tasks": Task[], "settings": ProjectSettings }`.

### Server functions — JSON file persistence

`src/lib/json-persist.ts`:

- `getProjectData` — `createServerFn({ method: "GET", strict: false })`. Reads `project-data.json` from `process.cwd()`.
- `mergeProjectData` — `createServerFn({ method: "POST", strict: false })`. Merges partial data with existing file.

`strict: false` is required — TanStack Start's serializability checker rejects `unknown[]` / `Record<string, unknown>` otherwise.

**This TanStack Start version does NOT export `createAPIFileRoute`** — use `createServerFn` only.

### Routing — file-based, do not invent Next.js patterns

Routes live in `src/routes/`. Only `__root.tsx` (shell) and `index.tsx` (Gantt page) exist. Do NOT create `src/pages/`, `_app/`, or `app/layout.tsx`.

`routeTree.gen.ts` is auto-generated — never edit by hand.

### Gantt chart

- Weeks Mon–Fri, weekends excluded. Day grid: 40px columns. Sprints: 2 calendar weeks.
- Bar colors via CSS variables in `src/styles.css`: `status-progress` (blue), `status-complete` (green), `status-blocked` (red), `status-partial` (orange). Today line in `--today` (red).
- Pure date/timeline/sprint functions in `src/lib/gantt-utils.ts` — reuse, do not duplicate.

### Key file layout

```
src/
  components/gantt/     — GanttChart, TaskList, TaskDetail, SettingsDialog, DatePicker
  components/ui/        — shadcn/ui (new-york style, do not hand-edit)
  hooks/                — use-mobile.tsx
  lib/gantt-store.ts    — task state
  lib/settings-store.ts — settings state
  lib/gantt-utils.ts    — pure date/timeline functions
  lib/json-persist.ts   — server functions → project-data.json
  lib/utils.ts          — cn() helper
  routes/__root.tsx     — app shell, QueryClientProvider, error/404
  routes/index.tsx      — Gantt page
  router.tsx            — createRouter + QueryClient context
  server.ts             — SSR entry, h3 error recovery
  start.ts              — createStart + error/CSRF middleware
  styles.css            — Tailwind v4 + CSS variables (light/dark)
```

## Layer boundaries

| Layer            | Location                                              | Owns                                                            |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Server functions | `src/lib/json-persist.ts`                             | reading/writing `project-data.json` only                        |
| Client stores    | `src/lib/gantt-store.ts`, `src/lib/settings-store.ts` | state, localStorage, server sync                                |
| Gantt components | `src/components/gantt/`                               | timeline, task list, detail, settings dialog                    |
| UI primitives    | `src/components/ui/`                                  | shadcn/ui (do not hand-edit)                                    |
| Routes           | `src/routes/`                                         | page-level composition only                                     |
| Pure utilities   | `src/lib/gantt-utils.ts`                              | testable date/timeline logic, no side effects, no React imports |

## Path alias

`@/*` → `./src/*` (in `tsconfig.json` and `vite.config.ts`). No other aliases exist.

shadcn/ui aliases (from `components.json`): `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`.

## Lint rules

- `server-only` package is banned — use `*.server.ts` naming or `@tanstack/react-start/server-only`.
- `@typescript-eslint/no-unused-vars` is off.
- Empty `catch {}` blocks error — add a comment inside.
- ESLint ignores `dist`, `.output`, `.vinxi`.

## Code style

- Prettier: double quotes, semicolons, trailing commas, 100-char print width.
- UI text is in Spanish.
- Use `cn()` from `@/lib/utils` for conditional classnames.
- Prefer shadcn/ui component classes and existing CSS variable tokens first, then Tailwind utilities for layout or small adjustments.
- Icons: `lucide-react`. Import directly from `lucide-react`.

## Theme source of truth

`src/styles.css` — CSS variables for light (`:root`) and dark (`.dark`). shadcn/ui semantic tokens (`--background`, `--foreground`, `--primary`, etc.) plus custom project tokens (`--status-progress`, `--status-complete`, `--status-blocked`, `--status-partial`, `--status-pending`, `--today`). Do not duplicate theme configuration elsewhere.

## Vite config

`vite.config.ts`: plugins are `@tanstack/devtools-vite`, `@tanstack/react-start/plugin/vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`. CSS transformer: `lightningcss`. Dev server: `host: "::"`, `port: 8080`. No wrapper package.
