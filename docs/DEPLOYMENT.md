# Deployment

Quantamari is a browser-only static PWA served from
[quantamari.royashbrook.com](https://quantamari.royashbrook.com/). The
[`royashbrook/quantamari`](https://github.com/royashbrook/quantamari)
repository is the production source of truth.

## Release contract

- Every branch push runs the commit-message guard. Pull requests run the
  static, unit, artifact, Chromium, WebKit, iPhone, and offline-recovery
  contracts without deploying.
- Every production-affecting push to `main` runs the same verification and
  automatically deploys the verified `dist/client` artifact. Markdown-only
  pushes intentionally skip the deployment workflow.
- The deploy job publishes the exact artifact produced by the verify job with
  Wrangler. It does not rebuild the application after verification.
- Production is served at the domain root. The canonical game URL is `/`, the
  install manifest and service worker are root-scoped, and recovery lives at
  `/rescue`.
- After deployment, CI waits for `/_app/version.json` to report the pushed
  commit, then uses headless Chromium to prove that the production service
  worker controls the app and that both `/` and `/rescue` work offline.

## One-time setup

From a trusted local clone with GitHub authentication:

```bash
git remote -v
git remote add origin https://github.com/royashbrook/quantamari.git
```

Do not replace a working GitHub remote merely to match the example name.

The repository needs a `CLOUDFLARE_API_TOKEN` Actions secret with permission to
deploy the Worker. The Worker name, account, static-asset rules, and custom
domain are versioned in `wrangler.jsonc`; do not recreate them manually in the
Cloudflare dashboard.

## Normal release

1. Work on an issue-linked branch. Every commit message must include its
   GitHub issue number.
2. Run `npm run test:all`.
3. Merge the reviewed branch to `main` and push. Never force-push.
4. Let `.github/workflows/deploy-site.yml` verify and deploy the exact commit.
5. Confirm the workflow's production PWA smoke passes before creating the
   release tag.

For a manual production re-run of an already reviewed `main` commit, use the
workflow's `workflow_dispatch` entry. Do not publish a separate manual build:
the normal workflow preserves build provenance and performs the production
offline checks.

## Recovery and rollback

- Open [the save rescue page](https://quantamari.royashbrook.com/rescue) before
  clearing browser data. It can export and validate the local save, then remove
  only Quantamari app files.
- Roll back by reverting the release commit on GitHub `main`. Do not use
  `--force`, `reset --hard`, or delete `main`.
- If local and GitHub history diverge, fetch and reconcile on a temporary
  branch.
- Old shared-site URLs and worker tombstones are owned by the public-site
  repository. Keep those handoff files in place while legacy installations
  may still exist.
