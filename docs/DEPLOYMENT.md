# GitHub deployment workflow

Quarkatamari is a browser-only static PWA. GitHub is the normal release path:

- **GitHub** (`royashbrook/quarkatamari`) is the source of truth.
- Every verified production-affecting push to GitHub `main` automatically
  deploys production; Markdown-only pushes do not run the workflow.
- Branch pushes and pull requests run the same static, unit, and browser
  contracts without deploying.

## One-time setup

From a trusted local clone with GitHub authentication:

```bash
git remote -v
git remote add origin https://github.com/royashbrook/quarkatamari.git
```

Do not replace a working GitHub remote merely to match the example name.

## Normal release

1. Work on a branch and run `npm run test:all`.
2. Commit the exact reviewed source state.
3. Fast-forward `main` to that commit and push `main` to GitHub.
4. GitHub runs the Node, static artifact, desktop/mobile, and offline tests.
5. After they pass, the workflow asks `royashbrook.com` to build the exact
   verified Quarkatamari commit and rejects a mismatched or missing artifact.
6. Verify the public URL, manifest, service worker, and current release marker.

For the v2 cutover, merge the backward-compatible
`royashbrook.com` branch `codex/quarkatamari-v2-integration` first. It preserves
the v1 path rewrite, copies v2 content-hashed chunks byte-for-byte, verifies
independent scheduled builds, and gives immutable chunks long-lived browser
caching. Then merge `codex/v2-sveltekit`.

Never force-push. Tags are pushed only when deliberately created as a release
checkpoint.

Release-cutover state belongs in GitHub issues rather than a repository backlog.
The v2 cutover is tracked in
[quarkatamari#6](https://github.com/royashbrook/quarkatamari/issues/6).

## Recovery

- Roll back by reverting the release commit on GitHub `main`; `v1.0.0` is the
  checkpoint immediately before the v2 framework rewrite.
- If local and GitHub history diverge, fetch and reconcile on a temporary
  branch. Do not use `--force`, `reset --hard`, or delete `main`.
