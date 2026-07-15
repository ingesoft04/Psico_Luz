#!/bin/sh
set -eu
while true; do
  stamp=$(date +%Y%m%d_%H%M%S)
  pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/backups/psico_luz_${stamp}.dump"
  find /backups -name 'psico_luz_*.dump' -type f -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete
  sleep 86400
done
