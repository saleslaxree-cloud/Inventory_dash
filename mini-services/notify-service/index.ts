/**
 * Laxree Notify Service — real-time notification broadcaster
 * Port: 3003
 */
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server, Socket } from 'socket.io'

const PORT = 3003

// ── Create HTTP server FIRST with our request handler ──
const httpServer = createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'notify', port: PORT, clients: io?.engine?.clientsCount || 0 }))
    return
  }

  // POST /emit — broadcast notification to a role room
  if (req.url === '/emit' && req.method === 'POST') {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf8')
        const payload = JSON.parse(bodyStr || '{}')
        const { toRole, notification } = payload
        if (!toRole || !notification) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'toRole and notification required' }))
          return
        }
        if (io) {
          try { io.to(toRole).emit('notification', notification) } catch (e) { console.error('[notify] emit error:', e) }
          try { io.to('*').emit('notification', notification) } catch (e) { console.error('[notify] broadcast error:', e) }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, delivered: true }))
      } catch (e) {
        console.error('[notify] parse error:', e)
        try { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })) } catch {}
      }
    })
    req.on('error', () => { try { res.writeHead(400); res.end('Bad request') } catch {} })
    return
  }

  // Let non-matching requests (e.g. /socket.io/) fall through to socket.io
  // by NOT ending the response — socket.io's listener will handle them
  if (req.url?.startsWith('/socket.io/')) {
    return // socket.io's attached listener will handle this
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

// ── Attach socket.io to the HTTP server AFTER our handler ──
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // path defaults to '/socket.io/'
})

io.on('connection', (socket: Socket) => {
  socket.on('join', (roles: string | string[]) => {
    const arr = Array.isArray(roles) ? roles : [roles]
    for (const r of arr) socket.join(r)
    socket.join('*')
  })
})

// Prevent crashes from uncaught errors
process.on('uncaughtException', (e) => { console.error('[notify] uncaughtException:', e) })
process.on('unhandledRejection', (e) => { console.error('[notify] unhandledRejection:', e) })

httpServer.listen(PORT, () => {
  console.log(`🔔 Laxree Notify Service on http://127.0.0.1:${PORT}`)
})
