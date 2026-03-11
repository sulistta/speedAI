# Blank Tauri App

Base project for a desktop app with Tauri, React, Vite, and TypeScript.

## Development

Install dependencies:

```bash
bun install
```

Start the app in development mode:

```bash
bun tauri dev
```

Create a production build:

```bash
bun build
```

## Structure

- `src/app`: app shell, providers, routes
- `src/components`: shared UI components
- `src/features`: feature modules
- `src/lib`: shared utilities
- `src-tauri`: native Tauri application
