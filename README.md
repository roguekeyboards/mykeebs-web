# mykeebs-web

The web UI for [kbdb](https://github.com/rogueserenity/kbdb), a personal mechanical keyboard
collection tracker. Use it to browse, add and edit keyboards, switches, keycap sets and the builds
that combine them.

Built with SvelteKit as a static SPA, authenticated via Stytch Connected Apps against the same
identity kbdb's REST API already trusts, and styled with Skeleton UI.

## Prerequisites

- [mise](https://mise.jdx.dev/), which installs the pinned Node version from `mise.toml`
- [gh CLI](https://cli.github.com/), authenticated, with the `read:packages` scope (needed to
  install `@rogueserenity/kbdb-api-client` from GitHub Packages):

  ```sh
  gh auth refresh -h github.com -s read:packages
  mise set GITHUB_PACKAGES_TOKEN=$(gh auth token) --file mise.local.toml
  ```

## Setup

```sh
cp .env.example .env   # fill in every value
mise install
eval "$(mise env)"
npm install
```

## Developing

```sh
npm run dev
# or: npm run dev -- --open
```

## Building and deploying

```sh
npm run build
```

Produces a static build in `/build` (adapter-static), using the public values committed in
`.env.production`. Preview it with `npm run preview`.

Every merge to `main` deploys to https://jay.mykeebs.dev. Cloudflare Workers Builds runs the build
and `wrangler deploy`, serving `build/` as a static-assets Worker (`wrangler.jsonc`).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the day-to-day workflow (branches and PRs, lint,
typecheck, tests).
