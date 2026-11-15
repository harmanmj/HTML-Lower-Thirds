#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. On Ubuntu: sudo apt install nodejs  (or use nvm / NodeSource for a newer version)"
  exit 1
fi
node server.js
