// Tailscale device discovery API route
// Env: TAILSCALE_API_KEY, TAILSCALE_TAILNET (defaults to "-" = your tailnet)
//
// Tags:
//   tag:agent-claude  → Claude Code relay (ports 8765-8774)
//   tag:agent-codex   → Codex app-server  (ports 4500-4509)
//   tag:agent         → both protocols scanned

import { tcpProbe } from "@axel-delafosse/protocol/tcp-probe"
import { NextResponse } from "next/server"

const TS_API = "https://api.tailscale.com/api/v2"
const CLAUDE_PORTS = Array.from({ length: 10 }, (_, i) => 8765 + i)
const CODEX_PORTS = Array.from({ length: 10 }, (_, i) => 4500 + i)
const PROBE_TIMEOUT_MS = 500

interface DiscoveredAgent {
  hostname: string
  ip: string
  protocol: "claude" | "codex"
  url: string
}

interface TailscaleDevice {
  addresses: string[]
  hostname: string
  tags: string[]
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === "string")
}

function formatHostForUrl(host: string): string {
  return host.includes(":") ? `[${host}]` : host
}

function parseDevices(payload: unknown): TailscaleDevice[] {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("devices" in payload) ||
    !Array.isArray(payload.devices)
  ) {
    return []
  }

  const devices: TailscaleDevice[] = []
  for (const raw of payload.devices) {
    if (typeof raw !== "object" || raw === null) {
      continue
    }
    const rec = raw as Record<string, unknown>
    const addresses = asStringArray(rec.addresses)
    if (addresses.length === 0) {
      continue
    }
    const tags = asStringArray(rec.tags)
    let hostname = addresses[0]
    if (typeof rec.hostname === "string") {
      hostname = rec.hostname
    } else if (typeof rec.name === "string") {
      hostname = rec.name
    }
    devices.push({ addresses, tags, hostname })
  }
  return devices
}

function includesAnyTag(tags: string[], candidates: string[]): boolean {
  return candidates.some((tag) => tags.includes(tag))
}

function agentsForDevice(device: TailscaleDevice): DiscoveredAgent[] {
  const ip = device.addresses[0]
  const host = formatHostForUrl(ip)
  const agents: DiscoveredAgent[] = []

  if (includesAnyTag(device.tags, ["tag:agent-claude", "tag:agent"])) {
    for (const port of CLAUDE_PORTS) {
      agents.push({
        hostname: device.hostname,
        ip,
        protocol: "claude",
        url: `ws://${host}:${port}/ws`,
      })
    }
  }

  if (includesAnyTag(device.tags, ["tag:agent-codex", "tag:agent"])) {
    for (const port of CODEX_PORTS) {
      agents.push({
        hostname: device.hostname,
        ip,
        protocol: "codex",
        url: `ws://${host}:${port}`,
      })
    }
  }

  return agents
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  return "Unknown discovery error"
}

async function filterReachableAgents(
  candidates: DiscoveredAgent[]
): Promise<DiscoveredAgent[]> {
  const checked = await Promise.all(
    candidates.map(async (agent) => {
      const port = Number.parseInt(new URL(agent.url).port, 10)
      if (!Number.isFinite(port)) {
        return null
      }
      const open = await tcpProbe(agent.ip, port, PROBE_TIMEOUT_MS)
      return open ? agent : null
    })
  )
  return checked.filter((agent): agent is DiscoveredAgent => agent !== null)
}

export async function GET() {
  const apiKey = process.env.TAILSCALE_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { agents: [], error: "TAILSCALE_API_KEY not set" },
      { status: 200 }
    )
  }

  const tailnet = process.env.TAILSCALE_TAILNET || "-"

  try {
    const res = await fetch(`${TS_API}/tailnet/${tailnet}/devices`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      // revalidate every 30s
      next: { revalidate: 30 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { agents: [], error: `Tailscale API ${res.status}` },
        { status: 200 }
      )
    }

    const data = await res.json()
    const devices = parseDevices(data)
    const candidates = devices.flatMap(agentsForDevice)
    const agents = await filterReachableAgents(candidates)

    return NextResponse.json({ agents })
  } catch (err: unknown) {
    return NextResponse.json(
      { agents: [], error: errorMessage(err) },
      { status: 200 }
    )
  }
}
