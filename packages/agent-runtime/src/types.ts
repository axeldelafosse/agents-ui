import type { CodexRpcMessage } from "@axel-delafosse/protocol/codex-rpc"
import type { StreamItem } from "@axel-delafosse/protocol/stream-items"
import type {
  ClaudeDelta,
  ClaudeMessageContentBlock,
  ClaudeStreamEvent,
} from "@axel-delafosse/protocol/stream-parsing"

export type Protocol = "claude" | "codex"
export type Status =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"

export type CodexThreadStatus = "notLoaded" | "idle" | "active" | "systemError"

export interface Agent {
  id: string
  output: string
  protocol: Protocol
  sessionId?: string // claude session id (for display)
  status: Status
  streamItems: StreamItem[]
  threadId?: string // codex thread id (for display)
  threadName?: string // codex thread/session name (if available)
  threadStatus?: CodexThreadStatus // codex thread lifecycle status
  url: string
}

export interface AgentTab {
  agents: Agent[]
  id: string
  identityId?: string
  representative: Agent
}

export interface ClaudeConn {
  protocol: "claude"
  ws: WebSocket
}

export interface CodexHub {
  agents: Set<string> // all agent IDs sharing this hub
  initialized: boolean
  lineBuffer: string
  pending: Map<
    number,
    { agentId?: string; cursor?: string; spawnThread?: boolean; type: string; threadId?: string }
  > // rpcId -> handler context
  pendingMsgs: Map<string, string> // agentId -> queued message (before threadId ready)
  pendingSubagentParents: Array<{ agentId: string; expiresAt: number }>
  pendingTurnEvents: Map<
    string,
    Array<{ expiresAt: number; msg: CodexRpcMessage }>
  > // turnId -> buffered notifications awaiting thread/agent route
  primaryThreads: Set<string> // threads created via explicit thread/start (not subagents)
  reconnectEnabled: boolean // disabled for discovery-only hubs
  rpcId: number
  threadMetaRequested: Set<string> // thread IDs already queried via thread/read
  // routing
  threads: Map<string, string> // threadId -> agentId
  turns: Map<string, string> // turnId -> agentId
  turnThreads: Map<string, string> // turnId -> threadId
  url: string
  ws: WebSocket
}

export interface ClaudeUIMessage {
  content?: string
  content_block?: { type?: string; name?: string }
  content_block_index?: number
  data?: unknown
  delta?: ClaudeDelta
  duration?: number
  duration_ms?: number
  event?: ClaudeStreamEvent
  index?: number
  input?: string
  message?: {
    content?: ClaudeMessageContentBlock[]
  }
  model?: string
  name?: string
  output?: string
  request?: { subtype?: string; tool_name?: string }
  session_id?: string
  sessionId?: string
  subtype?: string
  text?: string
  tool?: string
  type?: string
}

export interface DiscoveredEndpoint {
  protocol: Protocol
  url: string
}
