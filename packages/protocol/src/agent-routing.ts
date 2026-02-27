export type AgentStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"

export interface CodexReusableAgentCandidate {
  output: string
  status: AgentStatus
  threadId?: string
}

export function isReusableCodexPlaceholder(
  agent?: CodexReusableAgentCandidate
): boolean {
  if (!agent) {
    return false
  }
  if (agent.threadId) {
    return false
  }
  if (agent.output) {
    return false
  }
  return agent.status === "connecting" || agent.status === "connected"
}
