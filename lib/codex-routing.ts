import {
  type CodexRpcParams,
  codexThreadIdFromParams,
  codexTurnIdFromParams,
} from "@/lib/codex-rpc"

export type CodexRoutingParams = CodexRpcParams

export interface CodexRouteResult {
  agentId?: string
  mappedThreadId?: string
}

export interface CodexPendingContext {
  agentId?: string
  type: string
}

export interface EnsureCodexThreadRouteResult {
  agentId: string
  created: boolean
}

export function ensureCodexThreadRoute(
  threads: Map<string, string>,
  agents: Set<string>,
  threadId: string,
  createAgentId: () => string
): EnsureCodexThreadRouteResult {
  const existingAgentId = threads.get(threadId)
  if (existingAgentId) {
    return { agentId: existingAgentId, created: false }
  }

  const agentId = createAgentId()
  threads.set(threadId, agentId)
  agents.add(agentId)
  return { agentId, created: true }
}

export function resolveCodexNotificationAgent(
  threads: Map<string, string>,
  turns: Map<string, string>,
  params?: CodexRoutingParams
): CodexRouteResult {
  const threadId = codexThreadIdFromParams(params)
  const turnId = codexTurnIdFromParams(params)

  let agentId = threadId ? threads.get(threadId) : undefined
  if (!agentId && turnId) {
    agentId = turns.get(turnId)
  }

  if (agentId) {
    return { agentId }
  }
  return {}
}

export function pendingThreadStartAgent(
  pendingContexts: Iterable<CodexPendingContext>
): string | undefined {
  let initializeOwner: string | undefined
  for (const pending of pendingContexts) {
    if (pending.type === "thread_start" && pending.agentId) {
      return pending.agentId
    }
    if (!initializeOwner && pending.type === "initialize" && pending.agentId) {
      initializeOwner = pending.agentId
    }
  }
  return initializeOwner
}

export function applyCodexTurnRouting(
  turns: Map<string, string>,
  method: string | undefined,
  params: CodexRoutingParams | undefined,
  agentId: string
): void {
  const turnId = codexTurnIdFromParams(params)
  if (method === "turn/started" && turnId) {
    turns.set(turnId, agentId)
    return
  }

  if (method === "turn/completed" && turnId) {
    turns.delete(turnId)
  }
}
