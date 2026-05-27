# Tiinex Site

Public landing page for Tiinex.

This site presents Tiinex as infrastructure for owned continuity: explicit, recoverable, inspectable, portable, lineage-aware, and runtime-agnostic AI-assisted workflows.

## Publishing

This site is published by the GitHub Actions workflow in [`site/.github/workflows/publish-public.yml`](.github/workflows/publish-public.yml).

## What It Publishes

- Source: the root of this `site` repository
- Publish target: the `public` branch
- Output behavior: copies the static site files, adds `.nojekyll`, and writes `CNAME` when configured

## Default Behavior

- Pushes to `master` trigger a publish to `public`
- Manual runs can publish any branch, tag, or commit to `public` through `workflow_dispatch`
- The first successful run creates the `public` branch automatically if it does not exist yet

## Current Domain Plan

- Canonical Pages domain: `tiinex.dev`
- Secondary domain: `tiinex.com`
- Redirect plan: forward `tiinex.com` to `https://tiinex.dev`
- Repo source of truth: `CNAME`

## Manual Publish

Run `Publish Public Branch` from the Actions tab when you want to republish manually.
