#!/bin/sh
# Startet den Server ohne Root-Rechte: Datenordner einmal dem Benutzer „node“ geben
# (ältere Installationen haben ihn als root angelegt), dann Rechte abgeben.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}"
  chown -R node:node "${DATA_DIR:-/data}" 2>/dev/null || echo "⚠️  Konnte die Rechte von ${DATA_DIR:-/data} nicht anpassen" >&2
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
