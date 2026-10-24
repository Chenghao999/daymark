#!/usr/bin/env bash
# Cut a release: verify, tag, push. GitHub Actions then builds the installers
# for macOS/Windows/Linux and drafts a GitHub release.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./package.json').version")
tauri_version=$(node -p "require('./src-tauri/tauri.conf.json').version")
if [[ "$version" != "$tauri_version" ]]; then
  echo "package.json ($version) and tauri.conf.json ($tauri_version) disagree." >&2
  exit 1
fi

tag="v$version"
if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "Tag $tag already exists. Bump the version first." >&2
  exit 1
fi

npm run verify
git tag -a "$tag" -m "Daymark $tag"
git push origin "$tag"
echo "Pushed $tag. Watch the Release workflow, then publish the draft release."
