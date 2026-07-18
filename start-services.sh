#!/bin/bash
# Start both the challan-extract mini-service (port 3031) and the Next.js dev
# server (port 3000) with supervision so they auto-restart after OOM kills.
cd /home/z/my-project

# Clean up any previous instances
pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f "bun.*index.ts" 2>/dev/null
pkill -9 -f "challan-extract/supervise" 2>/dev/null
pkill -9 -f "next-supervise" 2>/dev/null
sleep 2

# ── Start challan-extract mini-service with supervisor ──
cd /home/z/my-project/mini-services/challan-extract
setsid bash -c 'exec ./supervise.sh' < /dev/null > /tmp/extract-service.log 2>&1 &
disown
echo "challan-extract supervisor started"
cd /home/z/my-project

# ── Start Next.js dev server with supervisor ──
cat > /tmp/next-supervise.sh << 'EOF'
#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[next-supervisor] starting Next.js dev server on port 3000..."
  bun run dev 2>&1
  EXIT_CODE=$?
  echo "[next-supervisor] next dev exited with code $EXIT_CODE, restarting in 3s..."
  sleep 3
done
EOF
chmod +x /tmp/next-supervise.sh
setsid bash -c 'exec /tmp/next-supervise.sh' < /dev/null > /home/z/my-project/dev.log 2>&1 &
disown
echo "next dev supervisor started"

# Wait for both to come up
sleep 10

# ── Keepalive loop — ping every 30s to prevent idle shutdown ──
(while true; do
  curl -s -o /dev/null http://localhost:3000/ --max-time 5 2>/dev/null
  curl -s -o /dev/null http://127.0.0.1:3031/ --max-time 5 2>/dev/null
  sleep 30
done) &
disown
echo "keepalive started"

sleep 2
echo "=== status ==="
curl -s -o /dev/null -w "next:       HTTP %{http_code}\n" http://localhost:3000/ --max-time 10
curl -s -o /dev/null -w "extract-svc: HTTP %{http_code}\n" http://127.0.0.1:3031/ --max-time 5
