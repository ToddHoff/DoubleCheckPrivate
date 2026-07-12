#!/usr/bin/env bash
# Serve the test fixture pages over http:// for manual extension testing.
# Why a server: extensions can't reach file:// pages (activeTab won't inject
# there), so the card / scan / audit flows only work when tests/pages/*.html
# is served over http. Port defaults to 8000; override with an arg or $PORT.
set -euo pipefail

PORT="${1:-${PORT:-8000}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/tests/pages"

echo "Serving $DIR at:"
echo "  http://localhost:$PORT/all-formats.html"
echo "  http://localhost:$PORT/plain.html"
echo "Press Ctrl+C to stop."
exec python3 -m http.server "$PORT" --directory "$DIR"
