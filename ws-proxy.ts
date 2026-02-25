import { createServer } from "node:http"
import { WebSocket, WebSocketServer } from "ws"
import { tcpProbe } from "./lib/tcp-probe.ts"

// Standalone WebSocket proxy + probe server on port 3001.
// Browser connects here; we forward to the real backend with
// perMessageDeflate disabled (Codex app-server doesn't support it).
//
// WS:   ws://localhost:3001/?url=ws://host:port
// HTTP:  GET /probe?ports=4500,4501,8765 — returns JSON array of open ports

const PROXY_PORT = 3001
const LOCAL_PROBE_HOSTS = ["127.0.0.1", "::1", "localhost"] as const

function normalizeTargetUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

async function probeAnyLocalhost(
  port: number,
  timeoutMs: number
): Promise<boolean> {
  const checks = await Promise.all(
    LOCAL_PROBE_HOSTS.map((host) => tcpProbe(host, port, timeoutMs))
  )
  return checks.some(Boolean)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost")

  if (url.pathname === "/probe") {
    const portsParam = url.searchParams.get("ports") || ""
    const ports = portsParam
      .split(",")
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => n > 0 && n < 65_536)

    const results = await Promise.all(
      ports.map((p) => probeAnyLocalhost(p, 500).then((ok) => (ok ? p : null)))
    )
    const open = results.filter((p): p is number => p !== null)

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    })
    res.end(JSON.stringify(open))
    return
  }

  res.writeHead(200, { "Content-Type": "text/plain" })
  res.end("ws-proxy")
})

const wss = new WebSocketServer({ server })

wss.on("connection", (client, req) => {
  const params = new URL(req.url || "/", "http://localhost").searchParams
  const target = params.get("url")
  if (!target) {
    client.close(4400, "missing ?url= param")
    return
  }

  const normalizedTarget = normalizeTargetUrl(target)
  if (!normalizedTarget) {
    client.close(4400, "invalid ?url= param")
    return
  }

  let backend: WebSocket
  try {
    backend = new WebSocket(normalizedTarget, { perMessageDeflate: false })
  } catch {
    client.close(4400, "invalid ?url= param")
    return
  }
  const queue: string[] = []
  let backendOpen = false

  backend.on("open", () => {
    console.log(`connected to ${normalizedTarget}`)
    backendOpen = true
    for (const msg of queue) {
      backend.send(msg)
    }
    queue.length = 0
  })

  backend.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) {
      const payload = isBinary ? data : data.toString()
      client.send(payload, { binary: isBinary })
    }
  })

  backend.on("close", (code, reason) => {
    if (backendOpen) {
      console.log(`${normalizedTarget} closed: ${code} ${reason}`)
    }
    try {
      if (client.readyState <= WebSocket.OPEN) {
        client.close(code === 1006 ? 1001 : code, reason.toString())
      }
    } catch {
      // ignore close errors
    }
  })

  backend.on("error", () => {
    try {
      if (client.readyState <= WebSocket.OPEN) {
        client.close(1001, "backend unreachable")
      }
    } catch {
      // ignore close errors
    }
  })

  client.on("message", (data) => {
    const text = data.toString()
    if (backendOpen && backend.readyState === WebSocket.OPEN) {
      backend.send(text)
    } else if (!backendOpen) {
      queue.push(text)
    }
  })

  client.on("close", () => {
    try {
      if (backend.readyState <= WebSocket.OPEN) {
        backend.close()
      }
    } catch {
      // ignore close errors
    }
  })

  client.on("error", () => {
    try {
      if (backend.readyState <= WebSocket.OPEN) {
        backend.close()
      }
    } catch {
      // ignore close errors
    }
  })
})

server.listen(PROXY_PORT, () => {
  console.log(`listening on port ${PROXY_PORT}`)
})

process.on("uncaughtException", (err) => {
  console.error("uncaught exception (kept alive):", err.message)
})

process.on("unhandledRejection", (err) => {
  console.error("unhandled rejection (kept alive):", err)
})
