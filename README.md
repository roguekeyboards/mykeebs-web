# mykeebs-web

The web UI for [mykeebs-api](https://github.com/roguekeyboards/mykeebs-api), a personal mechanical keyboard
collection tracker. Use it to browse, add and edit keyboards, switches, keycap sets and the builds
that combine them.

Built with SvelteKit as a static SPA, authenticated via Stytch Connected Apps against the same
identity mykeebs-api's REST API already trusts, and styled with Skeleton UI.

## Prerequisites

- [mise](https://mise.jdx.dev/), which installs the pinned Node version from `mise.toml`
- [gh CLI](https://cli.github.com/), authenticated, with the `read:packages` scope (needed to
  install `@roguekeyboards/mykeebs-api-client` from GitHub Packages):

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
npm run build        # dev values from .env.dev
npm run build:prod   # prod values from .env.prod
```

Produces a static build in `/build` (adapter-static), using the public values committed in the env
file. Preview it with `npm run preview`.

Every merge to `main` deploys to https://jay.mykeebs.dev: Cloudflare Workers Builds runs the build
and `wrangler deploy`, serving `build/` as the static-assets Worker `mykeebs-dev` (`wrangler.jsonc`).
`mise run deploy-dev` deploys the current branch there by hand, until the next merge replaces it.

Prod at https://mykeebs.info deploys on a release. release-please keeps a release PR open; merging
it publishes a GitHub Release, and the `Deploy prod` workflow builds that tag with `.env.prod` and
deploys the `mykeebs-prod` Worker. Run `Deploy prod` by hand with an older tag to roll back.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the day-to-day workflow (branches and PRs, lint,
typecheck, tests).
