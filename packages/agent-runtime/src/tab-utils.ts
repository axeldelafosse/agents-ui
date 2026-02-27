import type { Agent, AgentTab, Status } from "./types"
import { type CodexRpcParams, codexTurnIdFromParams } from "@axel-delafosse/protocol/codex-rpc"

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function shortId(id?: string): string {
  if (!id) {
    return ""
  }
  if (id.length <= 12) {
    return id
  }
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

function identityIdForAgent(agent: Agent): string | undefined {
  if (agent.protocol === "claude") {
    return agent.sessionId
  }
  return agent.threadId
}

export function tabIdForAgent(agent: Agent): string {
  const identityId = identityIdForAgent(agent)
  if (identityId) {
    return `${agent.protocol}:${agent.url}:${identityId}`
  }
  return `pending:${agent.id}`
}

function statusPriority(status: Status): number {
  switch (status) {
    case "connected":
      return 4
    case "reconnecting":
      return 3
    case "connecting":
      return 2
    default:
      return 1
  }
}

function shouldPreferTabRepresentative(
  candidate: Agent,
  current: Agent
): boolean {
  const candidateStatus = statusPriority(candidate.status)
  const currentStatus = statusPriority(current.status)
  if (candidateStatus !== currentStatus) {
    return candidateStatus > currentStatus
  }
  const candidateHasOutput = Boolean(
    candidate.output || candidate.streamItems.length > 0
  )
  const currentHasOutput = Boolean(
    current.output || current.streamItems.length > 0
  )
  if (candidateHasOutput !== currentHasOutput) {
    return candidateHasOutput
  }
  const candidateHasIdentity = Boolean(identityIdForAgent(candidate))
  const currentHasIdentity = Boolean(identityIdForAgent(current))
  if (candidateHasIdentity !== currentHasIdentity) {
    return candidateHasIdentity
  }
  // Prefer the latest observed agent when all other tie-breakers match.
  return true
}

export function buildAgentTabs(agents: Agent[]): AgentTab[] {
  const tabs = new Map<string, AgentTab>()
  for (const agent of agents) {
    const tabId = tabIdForAgent(agent)
    const existing = tabs.get(tabId)
    if (!existing) {
      tabs.set(tabId, {
        agents: [agent],
        id: tabId,
        identityId: identityIdForAgent(agent),
        representative: agent,
      })
      continue
    }
    existing.agents.push(agent)
    if (!existing.identityId) {
      existing.identityId = identityIdForAgent(agent)
    }
    if (shouldPreferTabRepresentative(agent, existing.representative)) {
      existing.representative = agent
    }
  }
  return [...tabs.values()]
}

export function turnIdFromParams(params?: CodexRpcParams): string | undefined {
  return codexTurnIdFromParams(params)
}

export function statusIndicatorClass(status: Status): string {
  switch (status) {
    case "connected":
      return "bg-emerald-400"
    case "connecting":
      return "bg-amber-400"
    case "reconnecting":
      return "bg-orange-400"
    default:
      return "bg-zinc-500"
  }
}

export function firstOpenTurnAgent(
  turns: Map<string, string>
): string | undefined {
  if (turns.size !== 1) {
    return undefined
  }
  return turns.values().next().value
}

export function isCodexItemMessage(method?: string): boolean {
  if (!method) {
    return false
  }
  return (
    method === "item/agentMessage/delta" ||
    method === "item/completed" ||
    method === "item/commandExecution/outputDelta" ||
    method === "item/reasoning/summaryTextDelta" ||
    method === "item/reasoning/textDelta" ||
    method === "item/reasoning/summaryPartAdded" ||
    method === "item/plan/delta" ||
    method === "item/commandExecution/terminalInteraction" ||
    method === "item/fileChange/outputDelta" ||
    method === "item/mcpToolCall/progress" ||
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval" ||
    method === "item/tool/requestUserInput" ||
    method === "item/started"
  )
}

export function isTransientPlaceholderAgent(agent: Agent): boolean {
  return !(
    agent.output ||
    agent.streamItems.length > 0 ||
    agent.threadId ||
    agent.sessionId
  )
}

export function shouldHidePlaceholderAgent(
  agent: Agent,
  agents: Agent[]
): boolean {
  if (!isTransientPlaceholderAgent(agent)) {
    return false
  }
  if (agent.status === "disconnected") {
    return true
  }
  return agents.some(
    (candidate) =>
      candidate.id !== agent.id &&
      candidate.protocol === agent.protocol &&
      candidate.url === agent.url &&
      Boolean(
        candidate.output ||
          candidate.streamItems.length > 0 ||
          candidate.threadId ||
          candidate.sessionId
      )
  )
}
