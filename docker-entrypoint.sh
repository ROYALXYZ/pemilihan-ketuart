#!/bin/sh
# Pastikan folder data dapat ditulis oleh user `node`, termasuk saat bind mount
# dari host dimiliki root (umum terjadi pada VPS setelah `git clone` sebagai root).
set -e

DATA_PATH="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_PATH/photos"
  chown -R node:node "$DATA_PATH"
  exec su-exec node "$@"
fi

exec "$@"
