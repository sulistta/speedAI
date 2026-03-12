# Repository Guidelines

## Project Structure & Module Organization

The app is split between the React frontend in `src/` and the native Tauri shell in `src-tauri/`. Use `src/app/` for routing, providers, and top-level screens, `src/features/` for feature-scoped logic, `src/components/ui/` for shared UI primitives, and `src/lib/` for cross-cutting utilities. Static web assets belong in `public/`; packaged desktop assets and icons live in `assets/` and `src-tauri/icons/`.

## Build, Test, and Development Commands

Use Bun for day-to-day work:

- `bun install` installs JS dependencies.
- `bun tauri dev` runs the Vite frontend with the Tauri desktop shell.
- `bun build` type-checks and creates the production web build.
- `bun lint` runs ESLint with `--max-warnings 0`.
- `bun format` applies the shared Prettier rules.
- `cargo check --manifest-path src-tauri/Cargo.toml` is the fastest validation step after Rust changes.

The pre-commit hook runs `bunx lint-staged`, so keep staged files formatted before committing.

## Coding Style & Naming Conventions

Prettier is the source of truth: 4-space indentation, single quotes, no semicolons, and no trailing commas. TypeScript runs in `strict` mode; do not bypass unused-variable or switch-exhaustiveness warnings. Prefer the `@/` import alias over deep relative paths. Match the existing naming pattern: kebab-case file names (`main-view.tsx`, `settings-store.ts`), PascalCase React components and types, and small feature-local modules under `src/features/<feature>/`.

## Testing Guidelines

There is no committed automated test runner yet. Until one is added, every change should pass `bun lint` and `bun build`, and UI or Tauri behavior should be manually exercised in `bun tauri dev`. If you introduce tests, place them next to the code they cover using `*.test.ts` or `*.test.tsx` and document the command in `package.json`.

## Commit & Pull Request Guidelines

Recent history favors short, imperative subjects, sometimes with a conventional prefix such as `feat: add status feed` or `fix: persist API key`. Keep commits focused and easy to review. PRs should describe the user-visible change, list validation steps, link the relevant issue, and include screenshots or a short recording for UI updates.

## Security & Configuration Tips

Do not hardcode or commit secrets. Gemini API keys are stored locally through the Tauri store or browser `localStorage`; keep that pattern and use environment-free examples in docs and screenshots.
