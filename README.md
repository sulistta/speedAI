# Blank Tauri App

Base project for a desktop app with Tauri, React, Vite, and TypeScript.

## Development

Install dependencies:

```bash
bun install
bunx playwright install chromium
```

Start the app in development mode:

```bash
bun tauri dev
```

Create a production build:

```bash
bun build
```

Prepare the packaged web navigation runtime manually if you want to inspect the generated sidecar and browser assets:

```bash
bun run prepare:web-agent
```

## Structure

- `src/app`: app shell, providers, routes
- `src/components`: shared UI components
- `src/features`: feature modules
- `src/lib`: shared utilities
- `src-tauri`: native Tauri application

## Web Navigation Runtime

The browser automation tool is shipped as a Tauri sidecar binary plus a bundled Chromium runtime. End users do not need Bun, Node.js, or a manual browser install. The build machine still needs the Playwright Chromium download available so `bun run prepare:web-agent` can copy it into the Tauri bundle resources.
