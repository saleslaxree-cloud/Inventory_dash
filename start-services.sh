#!/bin/bash
# Start both services and keep them alive
cd /home/z/my-project

pkill -9 -f "next" 2>/dev/null
pkill -9 -f "bun index" 2>/dev/null
pkill -9 -f "curl.*localhost:3000" 2>/dev/null
sleep 2

# Start mini-service (challan-extract on port 3031)
cd /home/z/my-project/mini-services/challan-extract
nohup bun index.ts > /tmp/extract-service.log 2>&1 &
disown
echo "mini-service PID: $!"
cd /home/z/my-project

# Start Next.js dev server
nohup bun run dev > dev.log 2>&1 &
disown
echo "next dev PID: $!"

sleep 8

# Keepalive loop — ping every 2s to prevent idle OOM kill
(while true; do
  curl -s -o /dev/null http://localhost:3000/ 2>/dev/null
  sleep 2
done) &
disown
echo "keepalive PID: $!"

sleep 2
echo "=== status ==="
curl -s -o /dev/null -w "next: HTTP %{http_code}\n" http://localhost:3000/ --max-time 5
curl -s -o /dev/null -w "extract-svc: HTTP %{http_code}\n" http://127.0.0.1:3031/ --max-time 5
