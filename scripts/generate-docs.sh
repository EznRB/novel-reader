#!/usr/bin/env bash
# Generate markdown documentation using Typedoc (or similar).

set -euo pipefail

OUTPUT_DIR="docs/generated"

# Ensure Typedoc is installed (project dev dependency)
if ! npx typedoc --version >/dev/null 2>&1; then
  echo "Typedoc not found – installing..."
  npm install typedoc --no-save
fi

# Generate documentation from src directory (adjust if needed)
npx typedoc --out "$OUTPUT_DIR" src

echo "Documentation generated at $OUTPUT_DIR"
