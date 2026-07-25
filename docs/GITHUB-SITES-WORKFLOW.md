# GitHub and Sites workflow

Quarkatamari has two useful remotes:

- **Sites** is the production source/deployment lifecycle.
- **GitHub** (`royashbrook/quarkatamari`) is the private mirror and normal
  collaboration history.

The active cloud checkout may name either one `origin`, so the sync script uses
remote URLs—not assumed names—to identify both configured remotes.

## One-time setup

From a trusted local clone with GitHub authentication:

```bash
git remote -v
git remote add github https://github.com/royashbrook/quarkatamari.git
```

If `origin` is already GitHub, name the Sites remote `sites` instead. Do not
replace a working remote merely to match an example name.

## Normal release

1. Work on a branch and run `npm test` plus `npm run lint`.
2. Commit the exact reviewed source state.
3. Use the Sites checkpoint lifecycle to save and deploy that commit.
4. From a checkout that can authenticate to both endpoints, run:

   ```bash
   npm run sync:remotes
   ```

The script refuses a detached branch, a dirty tree, missing remotes, or a
non-fast-forward push. It never force-pushes. Tags are intentionally not pushed
unless they were created as part of a deliberate release.

## Recovery

- Roll back production with a saved Sites version; V14 is the checkpoint before
  the V15 backlog release.
- If the two histories diverge, fetch both and reconcile them on a temporary
  branch. Do not use `--force`, `reset --hard`, or delete either remote branch.
- A connector that cannot see the private personal repository cannot mirror it.
  Reconnect GitHub or run the sync from the already-authenticated local clone.
