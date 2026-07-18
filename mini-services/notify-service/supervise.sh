#!/bin/bash
# Supervisor for the notify mini-service — auto-restarts on crash/OOM
cd /home/z/my-project/mini-services/notify-service
while true; do
  echo "[notify-supervisor] starting notify service on port 3003..."
  bun index.ts 2>&1
  EXIT_CODE=$?
  echo "[notify-supervisor] notify service exited with code $EXIT_CODE, restarting in 3s..."
  sleep 3
done
