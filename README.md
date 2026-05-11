# Site Publishing

This site is published by the GitHub Actions workflow in [site/.github/workflows/publish-public.yml](.github/workflows/publish-public.yml).

## What It Publishes

- Source: the root of this `site` repository
- Publish target: the `public` branch
- Output behavior: copies the static site files, adds `.nojekyll`, and writes `CNAME` when configured

## Default Behavior

- Pushes to `master` trigger a publish to `public`
- Manual runs can publish any branch, tag, or commit to `public` through `workflow_dispatch`
- The first successful run creates the `public` branch automatically if it does not exist yet

## Repository Variables

- `PAGES_CNAME`: optional custom domain, for example `example.com`

## Current Domain Plan

- Canonical Pages domain: `tiinex.dev`
- Secondary domain: `tiinex.com`
- Redirect plan: forward `tiinex.com` to `https://tiinex.dev`
- Repo source of truth: `CNAME`

## GitHub Pages Setup

1. Open repository `Settings` -> `Pages`
2. Choose `Deploy from a branch`
3. Select `public`
4. Select `/ (root)` as the folder
5. Set the custom domain to `tiinex.dev`
6. If you later want the workflow to override the file-based setting, set `PAGES_CNAME`

## Squarespace DNS

For `tiinex.dev`, point the apex domain to GitHub Pages using these records:

- `A` -> `185.199.108.153`
- `A` -> `185.199.109.153`
- `A` -> `185.199.110.153`
- `A` -> `185.199.111.153`

Optional IPv6 records:

- `AAAA` -> `2606:50c0:8000::153`
- `AAAA` -> `2606:50c0:8000::154`
- `AAAA` -> `2606:50c0:8000::155`
- `AAAA` -> `2606:50c0:8000::156`

Optional `www` support for the same canonical domain:

- `CNAME` `www` -> `tiinex.github.io`

For `tiinex.com`, do not point it at the site directly if `tiinex.dev` is canonical. Configure Squarespace or the registrar to redirect it to `https://tiinex.dev`.

## Manual Publish

Run `Publish Public Branch` from the Actions tab when you want to:

- republish without waiting for the next push
- publish from a specific branch, tag, or commit