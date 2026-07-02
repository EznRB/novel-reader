#!/usr/bin/env bash
# Backup audio cache (disk storage) to a timestamped archive.

set -euo pipefail

CACHE_DIR="${1:-cache/tts}"
BACKUP_DIR="${2:-backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVE="${BACKUP_DIR}/tts_cache_${TIMESTAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"
if [[ -d "$CACHE_DIR" ]]; then
  tar -czf "$ARCHIVE" -C "$CACHE_DIR" .
  echo "Cache backed up to $ARCHIVE"
else
  echo "Cache directory $CACHE_DIR not found"
fi
