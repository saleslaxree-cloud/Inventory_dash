#!/bin/bash
# Supervisor for the challan-extract mini-service.
# Restarts the service if it dies (e.g. OOM kill after a heavy VLM call).
cd "$(dirname "$0")"

while true; do
  echo "[supervisor] starting challan-extract on port 3031..."
  bun --hot index.ts 2>&1
  EXIT_CODE=$?
  echo "[supervisor] challan-extract exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
