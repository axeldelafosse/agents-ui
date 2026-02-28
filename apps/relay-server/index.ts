import type { ServerWebSocket } from "bun"

// Claude Code WebSocket relay server — dumb pipe.
// Forwards raw NDJSON between Claude CLI and frontend observers.
// Only intercepts control_request for auto-approval.
//
// Supports multiple ports — one Claude Code agent per port.
// Usage: bun run index.ts 8765 8766 8767
//    or: PORTS=8765,8766 bun run index.ts

interface WSData {
  port: number
  type: "claude" | "frontend"
}

type RelaySocket = ServerWebSocket<WSData>

class Relay {
  port: number
  claude: RelaySocket | null = null
  frontends = new Set<RelaySocket>()

  constructor(port: number) {
    this.port = port
  }

  broadcastRaw(data: string) {
    for (const ws of this.frontends) {
      ws.send(data)
    }
  }

  broadcastJson(msg: object) {
    this.broadcastRaw(JSON.stringify(msg))
  }

  handleClaudeRaw(text: string) {
    // Forward every line to frontends as-is
    this.broadcastRaw(text)

    // Intercept control_request for auto-approval
    for (const line of text.split("\n")) {
      if (!line.trim()) {
        continue
      }
      try {
        const msg = JSON.parse(line) as {
          request_id?: string
          type?: string
        }
        if (msg.type === "control_request" && msg.request_id && this.claude) {
          this.claude.send(
            `${JSON.stringify({
              type: "control_response",
              request_id: msg.request_id,
              permission: { allow: true },
            })}\n`
          )
        }
      } catch {
        // not JSON, forward only (already done above)
      }
    }
  }

  handleFrontendRaw(text: string) {
    // Forward raw to Claude — frontend is responsible for sending
    // messages in Claude's native format.
    // Also fan out to observing frontends so monitor UIs can display
    // user prompts that are only emitted frontend -> Claude (and may not
    // be echoed back by Claude as `type:"user"`).
    this.broadcastRaw(text)
    if (this.claude) {
      this.claude.send(text)
    }
  }
}

// --- parse ports from args or env ---

const args = process.argv.slice(2)
const ports: number[] = args.length
  ? args.map(Number).filter(Boolean)
  : (process.env.PORTS || "8765")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter(Boolean)

const relays = new Map<number, Relay>()

for (const port of ports) {
  const relay = new Relay(port)
  relays.set(port, relay)

  Bun.serve<WSData>({
    port,
    fetch(req, server) {
      const path = new URL(req.url).pathname
      if (path === "/ws") {
        if (
          server.upgrade(req, { data: { type: "frontend", port } as WSData })
        ) {
          return
        }
      } else if (
        server.upgrade(req, { data: { type: "claude", port } as WSData })
      ) {
        return
      }
      return new Response("WebSocket upgrade required", { status: 426 })
    },
    websocket: {
      open(ws) {
        const d = ws.data
        const r = relays.get(d.port)
        if (!r) {
          return
        }
        if (d.type === "claude") {
          r.claude = ws
          console.log(`[${d.port}] claude code connected`)
          // r.broadcastJson({ type: "status", text: "claude code connected" })
          return
        }
        r.frontends.add(ws)
        console.log(`[${d.port}] frontend connected`)
        // if (r.claude) {
        //   r.broadcastJson({
        //     type: "status",
        //     text: "claude code is connected",
        //   })
        // }
      },
      message(ws, raw) {
        const text = typeof raw === "string" ? raw : Buffer.from(raw).toString()
        const d = ws.data
        const r = relays.get(d.port)
        if (!r) {
          return
        }
        if (d.type === "frontend") {
          r.handleFrontendRaw(text)
          return
        }
        r.handleClaudeRaw(text)
      },
      close(ws) {
        const d = ws.data
        const r = relays.get(d.port)
        if (!r) {
          return
        }
        if (d.type === "claude") {
          r.claude = null
          console.log(`[${d.port}] claude code disconnected`)
          // r.broadcastJson({ type: "status", text: "claude code disconnected" })
          return
        }
        r.frontends.delete(ws)
      },
    },
  })
}

console.log(`\nrelays on ports: ${ports.join(", ")}\n`)
for (const port of ports) {
  console.log(
    `  [${port}] claude: claude --sdk-url ws://localhost:${port} -p "task" --output-format stream-json --input-format stream-json --print --verbose`
  )
  console.log(`  [${port}] frontend: ws://localhost:${port}/ws\n`)
}
