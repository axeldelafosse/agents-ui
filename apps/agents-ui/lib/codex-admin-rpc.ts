import type { CodexHub } from "@axel-delafosse/agent-runtime/types"

export interface CodexAdminRpcSender {
  nextRpcId: (hub: CodexHub) => number
  sendPayload: (hub: CodexHub, payload: unknown, agentId?: string) => void
}

// Phase 5a - Read surfaces

export function requestModelList(
  hub: CodexHub,
  sender: CodexAdminRpcSender
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "model_list" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "model/list",
    id,
    params: {},
  })
  return id
}

export function requestConfigRead(
  hub: CodexHub,
  sender: CodexAdminRpcSender
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "config_read" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "config/read",
    id,
    params: {},
  })
  return id
}

export function requestConfigRequirementsRead(
  hub: CodexHub,
  sender: CodexAdminRpcSender
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "config_requirements_read" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "configRequirements/read",
    id,
    params: {},
  })
  return id
}

export function requestAccountRead(
  hub: CodexHub,
  sender: CodexAdminRpcSender
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "account_read" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "account/read",
    id,
    params: {},
  })
  return id
}

export function requestAccountRateLimitsRead(
  hub: CodexHub,
  sender: CodexAdminRpcSender
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "account_rate_limits_read" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "account/rateLimits/read",
    id,
    params: {},
  })
  return id
}

// Phase 5b - Write/auth surfaces

export function requestConfigValueWrite(
  hub: CodexHub,
  sender: CodexAdminRpcSender,
  key: string,
  value: unknown
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "config_value_write" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "config/value/write",
    id,
    params: { keyPath: key, value, mergeStrategy: "replace" },
  })
  return id
}

export function requestConfigBatchWrite(
  hub: CodexHub,
  sender: CodexAdminRpcSender,
  edits: Array<{ key: string; value: unknown }>
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "config_batch_write" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "config/batchWrite",
    id,
    params: {
      edits: edits.map((edit) => ({
        keyPath: edit.key,
        value: edit.value,
        mergeStrategy: "replace",
      })),
    },
  })
  return id
}

export function requestAccountLoginStart(
  hub: CodexHub,
  sender: CodexAdminRpcSender,
  method: "api-key" | "chatgpt",
  apiKey?: string
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "account_login_start" })
  const params: Record<string, unknown> =
    method === "api-key" && apiKey
      ? { type: "apiKey", apiKey }
      : { type: "chatgpt" }
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "account/login/start",
    id,
    params,
  })
  return id
}

export function requestAccountLoginCancel(
  hub: CodexHub,
  sender: CodexAdminRpcSender
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "account_login_cancel" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "account/login/cancel",
    id,
    params: {},
  })
  return id
}

export function requestAccountLogout(
  hub: CodexHub,
  sender: CodexAdminRpcSender
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "account_logout" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "account/logout",
    id,
    params: {},
  })
  return id
}

// Phase 5c - MCP admin

export function requestMcpServerStatusList(
  hub: CodexHub,
  sender: CodexAdminRpcSender
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "mcp_server_status_list" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "mcpServerStatus/list",
    id,
    params: {},
  })
  return id
}

export function requestMcpServerOauthLogin(
  hub: CodexHub,
  sender: CodexAdminRpcSender,
  serverId: string
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "mcp_server_oauth_login" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "mcpServer/oauth/login",
    id,
    params: { serverId },
  })
  return id
}

export function requestMcpServerReload(
  hub: CodexHub,
  sender: CodexAdminRpcSender
): number {
  const id = sender.nextRpcId(hub)
  hub.pending.set(id, { type: "mcp_server_reload" })
  sender.sendPayload(hub, {
    jsonrpc: "2.0",
    method: "config/mcpServer/reload",
    id,
    params: {},
  })
  return id
}
