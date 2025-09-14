#!/bin/bash
set -euo pipefail

DATE=$(date +"%Y%m%d-%H%M%S")
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required (e.g., s3://my-bucket/flutterpos)}"

TMPFILE="/tmp/db-$DATE.sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$TMPFILE"
aws s3 cp "$TMPFILE" "$BACKUP_BUCKET/flutterpos-$DATE.sql.gz"
rm "$TMPFILE"
