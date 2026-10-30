# Contributing

## Workflow

`main` only changes through pull requests:

1. Branch off an up-to-date `main`, named `<type>/<topic>` (e.g. `fix/sort-order`).
2. Open a PR whose title follows [Conventional Commits](https://www.conventionalcommits.org/):
   `type(scope): subject`, using `feat`, `fix`, `chore`, `ci`, `docs`, `test`, `refactor` or
   `build`. The `PR Title` check enforces it. Put `Closes #N` in the body to close an issue on merge.
3. CI must pass: `Lint`, `Typecheck`, `Test`, `Build`, `PR Title` and CodeQL. Commits must be signed.
4. Squash-merge. The PR title becomes the commit message on `main`, and the branch is deleted.

Every merge to `main` deploys to https://jay.mykeebs.dev. Prod (https://mykeebs.info) deploys only
when the release-please release PR is merged, so check a change on dev first. To try a branch on
dev before merging it, run `mise run deploy-dev` (needs `npx wrangler login`); the next merge to
`main` replaces it.

Renovate opens dependency PRs and automerges non-major updates once CI passes. Major updates wait
on the Dependency Dashboard issue for a manual merge.

## Commands

```sh
npm run check     # typecheck (svelte-kit sync + svelte-check)
npm run lint       # prettier --check . && eslint .
npm run format      # prettier --write .
npm run test       # vitest run
```

Run `npm run lint`, `npm run check` and `npm run test` before opening a PR. `npm run format` will fix most lint
formatting complaints automatically; ESLint errors need manual fixes.

## Tests

Two vitest projects share `vite.config.ts`:

- `*.svelte.test.ts` — component tests, run in real headless Chromium via
  `vitest-browser-svelte`/Playwright.
- `*.spec.ts` — plain unit tests, run in Node.

Name new test files to match whichever project they belong in. Run a single file with
`npx vitest run path/to/file.spec.ts`, or filter by name with `npx vitest run -t "test name"`.

## Conventions

- Tabs, single quotes, no trailing commas, 100-char print width — enforced by Prettier
  (`prettier.config.js`); don't hand-format against it.
- Svelte 5 runes mode is forced project-wide (see `vite.config.ts`'s `compilerOptions.runes`).
- Env vars are declared in `src/env.ts` (`defineEnvVars`) and read via `$app/env/public`. Add a new
  one there, and to `.env.example`, `.env.dev` and `.env.prod` (the deployed values);
  `src/lib/build-config.spec.ts` fails until they all match. CI uses the committed files too.
  `KBDB_UPLOADS_ORIGIN` and `KBDB_IMAGES_ORIGIN` are build-only (read by `src/lib/csp.ts` when
  `vite.config.ts` loads, not by app code) and go in the same places.
- The CSP is built from the env's hosts by `src/lib/csp.ts` and emitted by SvelteKit as a `<meta>`
  tag with a hash of its inline script. Headers a `<meta>` can't set (`frame-ancestors`, HSTS, …)
  are in `static/_headers`, which Workers static assets apply to every response.
- Node is pinned in `mise.toml`. `.node-version` mirrors it for Cloudflare's build, and Renovate
  updates both, plus `@types/node`, in one grouped PR.
- This is a pure SPA (`adapter-static`, no server routes) — but `vite dev` and `svelte-check` still
  perform SSR of the initial render. Code that touches `window`/`document` outside of `onMount` (or
  an equivalent client-only guard) will crash server-side even though it never actually runs on a
  server in production.

## Installing `@roguekeyboards/kbdb-api-client`

This package is generated from kbdb's OpenAPI spec and published to GitHub Packages on every kbdb
release — it's not hand-written, so don't patch it in `node_modules`; bump the version in
`package.json` instead when the API changes.

Installing or updating it requires a GitHub Packages read token in your environment
(`GITHUB_PACKAGES_TOKEN`, referenced from `.npmrc`). One-time setup per machine:

```sh
gh auth refresh -h github.com -s read:packages
mise set GITHUB_PACKAGES_TOKEN=$(gh auth token) --file mise.local.toml
```

This value is a snapshot of `gh`'s token at the time you run it — if that token is later refreshed
or rotated, re-run the `mise set` line. `mise.local.toml` is gitignored; never commit a token.
