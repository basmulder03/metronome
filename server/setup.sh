#!/usr/bin/env bash
# Downloads a pinned PocketBase release, verifies its checksum and unpacks it into server/bin/.
set -euo pipefail
VERSION=0.40.5
DIR="$(cd "$(dirname "$0")" && pwd)"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) PLATFORM=linux_amd64 ;;
  Linux-aarch64) PLATFORM=linux_arm64 ;;
  Darwin-arm64) PLATFORM=darwin_arm64 ;;
  Darwin-x86_64) PLATFORM=darwin_amd64 ;;
  *) echo "unsupported platform: $(uname -sm)" >&2; exit 1 ;;
esac
[ -x "$DIR/bin/pocketbase" ] && "$DIR/bin/pocketbase" --version | grep -q "$VERSION" && { echo "PocketBase $VERSION already installed"; exit 0; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BASE="https://github.com/pocketbase/pocketbase/releases/download/v$VERSION"
ZIP="pocketbase_${VERSION}_${PLATFORM}.zip"
curl -fsSL "$BASE/$ZIP" -o "$TMP/$ZIP"
curl -fsSL "$BASE/checksums.txt" -o "$TMP/checksums.txt"
(cd "$TMP" && grep " $ZIP\$" checksums.txt | sha256sum -c -)
mkdir -p "$DIR/bin"
unzip -q -o "$TMP/$ZIP" pocketbase -d "$DIR/bin"
chmod +x "$DIR/bin/pocketbase"
echo "Installed PocketBase $VERSION"
