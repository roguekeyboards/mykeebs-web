# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev              # start dev server
npm run build             # production build (adapter-static output to /build)
npm run preview            # preview the production build

npm run check              # svelte-kit sync + svelte-check (typecheck)
npm run check:watch

npm run lint               # prettier --check . && eslint .
npm run format              # prettier --write .

npm run test               # vitest run (both client and server projects)
npm run test:unit           # vitest in watch mode
```

To run a single test file: `npx vitest run path/to/file.test.ts` (or `.svelte.test.ts` for a component test). To run tests matching a name: `npx vitest run -t "test name"`.

Env vars (`PUBLIC_STYTCH_CLIENT_ID`, `PUBLIC_KBDB_API_BASE_PATH`) are read via SvelteKit's `$env/static/public` and baked in at build time. `npm run build` reads the committed `.env.production` (the deployed values, public by design). `dev`, `check` and `test` need a local `.env` — copy `.env.example` and fill in values — and fail with an unhelpful Vite error if it's missing or missing a key. Adding a `PUBLIC_*` var means adding it to `.env.production`, `.env.example` and CI's `env:` block; `src/lib/build-config.spec.ts` fails until all three match the code.

Node is pinned in `mise.toml`, the source of truth. `.node-version` mirrors it only because Cloudflare's build can't read mise. Renovate's `node` group bumps both, plus `@types/node`, in one PR.

Installing/updating `@rogueserenity/kbdb-api-client` requires a GitHub Packages token in the environment. `mise.toml` documents this — the token itself lives in `mise.local.toml` (gitignored, not committed) as `GITHUB_PACKAGES_TOKEN`. Run `eval "$(mise env)"` before `npm install` if the token isn't already in your shell env.

## Workflow

`main` is protected by a ruleset: no direct pushes. Every change goes on a branch (`<type>/<topic>`) and through a PR with a Conventional Commits title (`feat`/`fix`/`chore`/`ci`/`docs`/`test`/`refactor`/`build`), which the `PR Title` check enforces. `Lint`, `Typecheck`, `Test` and `Build` (`.github/workflows/ci.yml`) must pass, plus CodeQL. Merges are squash-only, so the PR title becomes the commit message on `main`; put `Closes #N` in the PR body.

Renovate (`renovate.json`, run nightly by `.github/workflows/renovate.yml`) opens dependency PRs and automerges everything but major updates once checks pass. Majors wait on the Dependency Dashboard issue. It's pinned to npm 11 (`constraints`) because npm 12 wrongly refuses some registry tarballs.

**Deploys**: every merge to `main` deploys. Cloudflare Workers Builds (configured in the Cloudflare dashboard, not this repo) runs `npm run build` and `npx wrangler deploy`, publishing `build/` as the static-assets Worker `mykeebs-dev` (`wrangler.jsonc`) at https://jay.mykeebs.dev. The only build setting left in the dashboard is the `GITHUB_PACKAGES_TOKEN` secret. There are no per-PR previews.

## Architecture

This is a **pure client-side SPA** — `adapter-static` with `fallback: 'index.html'` (configured inline in `vite.config.ts`, not a separate `svelte.config.js`). There is no server runtime in production: no `+page.server.ts`/`+layout.server.ts` load functions, no API routes under `src/routes/api`. All data fetching and auth happens client-side. Despite this, `vite dev` and `svelte-check` still perform SSR of the initial render — code that touches `window`/`document` at module- or component-init time will crash server-side unless guarded (e.g. via Svelte's `onMount`, which only runs client-side).

**Auth**: identity is Stytch (Connected Apps), not a general-purpose auth SDK. The Authorization Code + PKCE flow against this app's `first_party_public` Connected App client is hand-rolled in `src/lib/auth/auth.svelte.ts` and `src/lib/auth/pkce.ts`, since Stytch's SDK has no built-in OAuth-client helper (only third-party social login via `oauth.continueWithX`). `signIn()` generates a PKCE verifier/challenge (`pkce.ts`, Web Crypto API), stashes the verifier in `localStorage`, and redirects to kbdb's own hosted Stytch consent page (kbdb's `internal/consent`, not a mykeebs-web route or a Stytch-hosted domain — Stytch's Connected Apps requires the app to host its own `<IdentityProvider>` UI, and kbdb owns this one so MCP clients can authenticate against it standalone). The redirect target is `/auth/callback` (`src/routes/auth/callback/+page.svelte`), which calls `exchangeCodeForToken(code)` to swap the returned `?code=` for an access token directly against Stytch's token endpoint, then navigates home.

`auth.svelte.ts` exposes this as Svelte 5 rune-based reactive state (`auth.status`, `auth.user`) plus `signIn`/`signOut`/`getAccessToken`, backed by an access token cached in `localStorage` (decoded client-side for `auth.user`, never re-verified — kbdb re-verifies every request server-side regardless). No `signUp` — Stytch's magic-link flow at kbdb's consent page handles both sign-up and sign-in as one action, so there's no separate signup entrypoint to expose here. Connected Apps access tokens are short-lived (1hr default), so `getAccessToken()` refreshes them ahead of expiry using a refresh token obtained via the `offline_access` scope. This is a public PKCE client, so Stytch rotates the refresh token on every exchange and concurrent refreshes would invalidate each other — callers therefore share one in-flight exchange. A failed refresh clears both tokens and signs the user out; a 401 from kbdb should prompt `signIn()` again.

**API client**: `src/lib/api/client.ts` instantiates the generated (`openapi-generator` `typescript-fetch`) `@rogueserenity/kbdb-api-client` classes (`BuildsApi`, `KeyboardsApi`, `KeycapSetsApi`, `LookupsApi`, `ProfilesApi`, `SwitchesApi`), all sharing one `Configuration` whose `accessToken` is the auth module's `getAccessToken` function — the generated client calls this per-request, so token refresh is transparent and nothing else needs to inject headers manually. This client is generated from kbdb's OpenAPI spec and published to GitHub Packages on every kbdb release; don't hand-edit anything under `node_modules/@rogueserenity/kbdb-api-client` — bump the version in `package.json` instead when the API changes.

**Image uploads**: every upload goes through `uploadImage` in `src/lib/upload.ts`, which first runs `prepareImage` (`src/lib/image-resize.ts`): it applies EXIF rotation, scales the long edge down to 2560px and re-encodes to WebP with `@jsquash/webp` (WASM, lazy-loaded on first upload). The WASM encoder is used because Safari's canvas can't export WebP. Don't call the image upload endpoints directly with the original file. `@jsquash/webp` is excluded from Vite's dep pre-bundling in `vite.config.ts`, which would otherwise separate it from its `.wasm` files. Page tests mock `$lib/image-resize`, since their placeholder files aren't decodable images.

kbdb moderates every upload, and the owner sees each image's `status` (`pending`/`approved`/`rejected`). A rejected image has no `url` but still counts toward the item's image limit until deleted, so galleries and cards go through `viewableImages` (`src/lib/image-moderation.ts`) while forms list every image. kbdb doesn't push moderation decisions and the app doesn't poll: opening an item with a pending image re-fetches it once through the same `staleImageRefetcher` used for expired urls, whose merges (`withFreshImages` and friends) carry the moderation fields. A 429 on an upload-URL request means kbdb's daily upload cap (shared by all users) is spent; `uploadErrorMessage` turns it into user-facing text. Photos staged before an item exists go through `uploadStaged` (`src/lib/upload.ts`), which stops at a 429. The create still counts as a success: after an ordinary failure the page reopens the new item for editing, and after a 429 (where retrying won't help) it closes with a `PageNotice`. The builds list has no edit mode, so it shows the notice either way.

**Testing**: `vite.config.ts` defines two vitest projects sharing one config: a `client` project (browser-mode, Playwright+Chromium, for `*.svelte.{test,spec}.ts` — real component rendering, excluding anything under `src/lib/server/`) and a `server` project (Node environment, for every other `*.{test,spec}.ts`). Match the existing naming convention (`Foo.svelte.test.ts` for component tests, `foo.spec.ts` for plain unit tests) so a new test lands in the right project automatically.

Every change ships with automated tests for its new behavior, in the same commit. Logic that's hard to test where it lives (e.g. inside a `+page.svelte`) gets extracted into a small `src/lib` module with its own spec, as `stale-images.ts` was.

**Styling**: Tailwind v4 (via `@tailwindcss/vite`, no `tailwind.config.js`) + Skeleton UI (`@skeletonlabs/skeleton` + `@skeletonlabs/skeleton-svelte`). Theme is currently `cerberus` (a placeholder, not a final choice). Global styles/theme setup live in `src/routes/layout.css`, imported once from the root `+layout.svelte`.

**Icons**: [Lucide](https://lucide.dev), imported by name from `@lucide/svelte` (`import { Globe } from '@lucide/svelte'`) and sized with a `class` prop. Don't paste raw `<svg>` path data inline — a named import can't silently drift into a hand-drawn approximation of the real icon, which is what the inline ones had done. Vite tree-shakes the import, so only the icons actually used are bundled. Lucide is ISC licensed and needs no in-app attribution.
