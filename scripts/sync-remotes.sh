#!/usr/bin/env bash
set -euo pipefail

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  echo "Refusing to sync a detached HEAD." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to sync a dirty worktree. Commit or stash changes first." >&2
  exit 1
fi

mapfile -t remotes < <(git remote)
if (( ${#remotes[@]} < 2 )); then
  echo "Configure both the Sites and GitHub remotes before syncing." >&2
  exit 1
fi

for remote in "${remotes[@]}"; do
  echo "Pushing ${branch} to ${remote}..."
  git push "$remote" "$branch:$branch"
done
