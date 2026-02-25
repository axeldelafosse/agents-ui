import {
  ALL_PROBE_PORTS,
  CLAUDE_INIT_LINE_REGEX,
  CLAUDE_SESSION_LINE_REGEX,
  CODEX_THREAD_LINE_REGEX,
} from "@/app/features/agents/constants"
import type { DiscoveredEndpoint, Protocol } from "@/app/features/agents/types"

function currentHost(): string {
  return typeof window !== "undefined" ? window.location.hostname : "localhost"
}

function formatHostForUrl(host: string): string {
  return host.includes(":") ? `[${host}]` : host
}

export function probeUrl(): string {
  return `http://${formatHostForUrl(currentHost())}:3001/probe?ports=${ALL_PROBE_PORTS.join(",")}`
}

export function portToDiscover(port: number): DiscoveredEndpoint | null {
  if (port >= 4500 && port <= 4509) {
    return { protocol: "codex", url: `ws://127.0.0.1:${port}` }
  }
  if (port >= 8765 && port <= 8774) {
    return {
      protocol: "claude",
      url: `ws://${formatHostForUrl(currentHost())}:${port}/ws`,
    }
  }
  return null
}

export function parseOpenPorts(payload: unknown): number[] {
  if (!Array.isArray(payload)) {
    return []
  }
  return payload.filter((item): item is number => typeof item === "number")
}

function isProtocol(value: unknown): value is Protocol {
  return value === "claude" || value === "codex"
}

export function parseTailDiscovery(payload: unknown): DiscoveredEndpoint[] {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("agents" in payload) ||
    !Array.isArray(payload.agents)
  ) {
    return []
  }

  const discovered: DiscoveredEndpoint[] = []
  for (const raw of payload.agents) {
    if (typeof raw !== "object" || raw === null) {
      continue
    }
    const rec = raw as Record<string, unknown>
    if (typeof rec.url !== "string" || !isProtocol(rec.protocol)) {
      continue
    }
    discovered.push({ protocol: rec.protocol, url: rec.url })
  }
  return discovered
}

export function parseClaudeSessionIdFromRawLine(
  line: string
): string | undefined {
  const match = line.match(CLAUDE_SESSION_LINE_REGEX)
  if (!match) {
    return undefined
  }
  const sessionId = match[1]?.trim()
  return sessionId || undefined
}

export function looksLikeClaudeInitLine(line: string): boolean {
  return CLAUDE_INIT_LINE_REGEX.test(line)
}

export function parseCodexThreadIdFromRawLine(
  line: string
): string | undefined {
  const match = line.match(CODEX_THREAD_LINE_REGEX)
  if (!match) {
    return undefined
  }
  const threadId = match[1]?.trim()
  return threadId || undefined
}
