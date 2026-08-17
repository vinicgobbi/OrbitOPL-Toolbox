# OrbitOPL Toolbox

Cross-platform Electron + Angular desktop app for managing PS1/PS2 game
libraries for the Open PS2 Loader (OPL).

## Monorepo layout

Two independent TypeScript projects, each with its own `tsconfig.json`:

- `src/` — Electron main process. Compiled with plain `tsc` (CommonJS,
  no bundler) into `dist/src/`.
- `angular/` — Angular renderer. A separate npm project, deliberately
  **outside** the pnpm workspace.
- `assets/` — static assets bundled into the packaged app (icons,
  `POPSTARTER.ELF`, game-list data).
- `scripts/` — setup and packaging helper scripts (see inline
  docstrings in each file for what it does).

## Package managers — do not mix them

- Root project: **pnpm** is canonical (`packageManager` field in
  `package.json`, `pnpm-workspace.yaml`). CI installs the root with
  `pnpm install --frozen-lockfile`. Never run `npm install` at the
  repo root — it would regenerate a stray `package-lock.json`, which
  is gitignored specifically because it doesn't belong here.
- `angular/`: a separate **npm** project (`npm ci` / `npm install`),
  intentionally not part of the pnpm workspace. Its
  `package-lock.json` is real and used by CI's cache key.
- `scripts/setup.sh` / `scripts/setup.ps1` are the executable source
  of truth for this split — root via `pnpm install`, `angular/` via
  `npm install`.

## Backend (`src/`)

```
src/
├── main.ts, preload.ts, logger.ts     entrypoints / cross-cutting
├── ipc/index.ts                       central IPC registry
├── features/<domain>/                 one folder per feature domain
└── utils/                             generic, feature-agnostic helpers
```

- `src/ipc/index.ts` is the single registration point: every
  `*.ipc.ts` file exports a `register<X>Ipc()` function, all called in
  sequence from `registerAllIpc()`. Adding IPC handlers for an
  existing feature means adding to its `features/<domain>/` folder and
  registering the function here; a genuinely new feature gets its own
  `features/<domain>/` folder.
- Feature domains today: `artwork`, `libretro` (game-ID/metadata
  lookups, broader than just artwork), `library` (library/cfg/apps/
  rename/delete management), `import` (PS1/PS2 disc import), `zso`
  (ISO↔ZSO compression), `app-shell` (window/settings/VMC).
- `src/utils/` holds helpers with no feature affinity (crc32, sanitize,
  http-get, fs-entry, etc.). Known exception, not a precedent: several
  disc-parsing utilities (`cue2pops.ts`, `cue-parser.ts`,
  `binmerge.ts`, `game-id-patterns.ts`, `games-list.ts`) are really
  specific to the `import` feature but still live here — don't use
  their presence in `utils/` to justify dropping new feature-specific
  code there.
- No path alias is configured for the backend on purpose: it compiles
  via plain `tsc` with no bundler, so an alias would need
  `tsc-alias`/`tsconfig-paths` at runtime for no real gain given import
  depth tops out at 2-3 levels.

## Frontend (`angular/src/app/`)

```
app/
├── pages/<name>/            routed views; page-private components live
│                            under pages/<name>/components/
└── shared/                  anything used by 2+ pages
    ├── components/, constants/, guards/, services/, types/
```

- Always import shared code via the `@shared/*` alias already
  configured in `angular/tsconfig.json` — never a relative
  `../../shared/...` path.
- Every component, dialog, or shared base class lives in its own
  kebab-case folder alongside its sibling files
  (`.ts`/`.html`/`.scss`/`.spec.ts`). Don't drop a loose `.ts` file
  next to component folders.
- `window.d.ts` (ambient `declare global` augmentation for the
  Electron preload API) intentionally stays at the `app/` root, not in
  `shared/types/` — that folder is for regular importable interfaces,
  a different category from ambient global declarations.

## Known technical debt (out of scope — don't "fix" opportunistically)

- `angular/src/app/shared/services/library.service.ts` (~880 lines) and
  `jobs.service.ts` (~630 lines) are multi-concern monoliths with no
  existing precedent of being split by concern in this codebase.
  Backend `library.service.ts`, `apps.service.ts`, and
  `game-id-resolver.service.ts` have a similar shape. Splitting these
  is a behavioral refactor with real regression risk — treat as a
  deliberate, separately-scoped task, not part of routine cleanup.
- `src/features/artwork/art-sources/types.ts` defines a multi-source
  artwork abstraction (`ArtSourceId`, `ArtServiceResult`, etc.) but
  only the `libretro` source has a concrete implementation today.

## Adding new code — quick decision guide

- New IPC handler for an existing feature → add to its
  `src/features/<domain>/` folder.
- New backend feature → new `src/features/<domain>/`, register in
  `src/ipc/index.ts`.
- New Angular page → `angular/src/app/pages/<name>/`.
- Logic used by 2+ pages → `angular/src/app/shared/services/`.
- Type shared across pages → `angular/src/app/shared/types/`.
