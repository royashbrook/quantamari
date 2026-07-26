# GitHub deployment workflow

Quarkatamari is a browser-only static PWA. GitHub is the normal release path:

- **GitHub** (`royashbrook/quarkatamari`) is the source of truth.
- Every push to GitHub `main` automatically deploys production.
- **Sites** remains configured only for optional isolated testing. Do not save
  or deploy a Sites version during a normal release.

## One-time setup

From a trusted local clone with GitHub authentication:

```bash
git remote -v
git remote add origin https://github.com/royashbrook/quarkatamari.git
```

Do not replace a working GitHub remote merely to match the example name.

## Normal release

1. Work on a branch and run `npm test` plus `npm run lint`.
2. Commit the exact reviewed source state.
3. Fast-forward `main` to that commit and push `main` to GitHub.
4. Wait for the automatic deployment, then verify the public URL, manifest,
   service worker, and current release marker.

Never force-push. Tags are pushed only when deliberately created as a release
checkpoint.

## Recovery

- Roll back by reverting the release commit on GitHub `main`; `v1.0.0` is the
  checkpoint immediately before the nested-world release.
- If local and GitHub history diverge, fetch and reconcile on a temporary
  branch. Do not use `--force`, `reset --hard`, or delete `main`.
