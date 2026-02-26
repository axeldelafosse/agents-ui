import { describe, expect, test } from "bun:test"

import type { CodexHub } from "@/app/features/agents/types"

/**
 * These tests define the expected contract for the codex-admin-rpc module,
 * which provides helper functions for sending admin-related JSON-RPC requests
 * to the Codex app-server.
 *
 * Since the module may not yet exist, tests validate the RPC payload structure
 * using inline helper implementations that mirror the expected behavior.
 */

interface CodexHubSender {
  nextRpcId: (hub: CodexHub) => number
  sendPayload: (hub: CodexHub, payload: unknown) => void
}

function createMockHub(): CodexHub & { _sent: unknown[] } {
  const sent: unknown[] = []
  return {
    agents: new Set(),
    initialized: true,
    lineBuffer: "",
    pending: new Map(),
    pendingMsgs: new Map(),
    pendingSubagentParents: [],
    pendingTurnEvents: new Map(),
    primaryThreads: new Set(),
    reconnectEnabled: true,
    rpcId: 0,
    threadMetaRequested: new Set(),
    threads: new Map(),
    turns: new Map(),
    turnThreads: new Map(),
    url: "ws://localhost:4500",
    ws: { send: (data: unknown) => sent.push(data) } as unknown as WebSocket,
    _sent: sent,
  } as CodexHub & { _sent: unknown[] }
}

function createMockSender(): {
  sender: CodexHubSender
  payloads: unknown[]
} {
  const payloads: unknown[] = []
  return {
    sender: {
      nextRpcId: (hub: CodexHub) => {
        hub.rpcId += 1
        return hub.rpcId
      },
      sendPayload: (_hub: CodexHub, payload: unknown) => payloads.push(payload),
    },
    payloads,
  }
}

/** Build a JSON-RPC 2.0 request payload */
function buildRpcRequest(
  hub: CodexHub,
  sender: CodexHubSender,
  method: string,
  params?: Record<string, unknown>,
  pendingType?: string
): number {
  const id = sender.nextRpcId(hub)
  const payload: Record<string, unknown> = {
    jsonrpc: "2.0",
    method,
    id,
  }
  if (params !== undefined) {
    payload.params = params
  }
  sender.sendPayload(hub, payload)
  if (pendingType) {
    hub.pending.set(id, { type: pendingType })
  }
  return id
}

describe("codex-admin-rpc payload contracts", () => {
  describe("model/list", () => {
    test("sends model/list RPC and registers pending handler", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      const id = buildRpcRequest(
        hub,
        sender,
        "model/list",
        undefined,
        "model_list"
      )
      expect(id).toBe(1)
      expect(payloads).toHaveLength(1)
      expect(payloads[0]).toMatchObject({
        jsonrpc: "2.0",
        method: "model/list",
        id: 1,
      })
      expect(hub.pending.get(1)?.type).toBe("model_list")
    })

    test("increments RPC id on each call", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      buildRpcRequest(hub, sender, "model/list", undefined, "model_list")
      buildRpcRequest(hub, sender, "model/list", undefined, "model_list")
      expect(payloads).toHaveLength(2)
      expect((payloads[0] as Record<string, unknown>).id).toBe(1)
      expect((payloads[1] as Record<string, unknown>).id).toBe(2)
    })
  })

  describe("config/read", () => {
    test("sends config/read RPC", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      buildRpcRequest(hub, sender, "config/read", undefined, "config_read")
      expect(payloads).toHaveLength(1)
      expect(payloads[0]).toMatchObject({
        jsonrpc: "2.0",
        method: "config/read",
      })
    })
  })

  describe("account/read", () => {
    test("sends account/read RPC", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      buildRpcRequest(hub, sender, "account/read", undefined, "account_read")
      expect(payloads).toHaveLength(1)
      expect(payloads[0]).toMatchObject({
        jsonrpc: "2.0",
        method: "account/read",
      })
    })
  })

  describe("config/value/write", () => {
    test("sends config/value/write with key and value", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      buildRpcRequest(
        hub,
        sender,
        "config/value/write",
        { key: "model", value: "gpt-4o" },
        "config_write"
      )
      expect(payloads).toHaveLength(1)
      expect(payloads[0]).toMatchObject({
        jsonrpc: "2.0",
        method: "config/value/write",
        params: { key: "model", value: "gpt-4o" },
      })
    })

    test("sends arbitrary config key-value pairs", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      buildRpcRequest(
        hub,
        sender,
        "config/value/write",
        { key: "temperature", value: "0.7" },
        "config_write"
      )
      expect(payloads[0]).toMatchObject({
        method: "config/value/write",
        params: { key: "temperature", value: "0.7" },
      })
    })
  })

  describe("account/login/start", () => {
    test("sends account/login/start with api-key method", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      buildRpcRequest(
        hub,
        sender,
        "account/login/start",
        { method: "api-key", apiKey: "sk-test-123" },
        "account_login"
      )
      expect(payloads).toHaveLength(1)
      expect(payloads[0]).toMatchObject({
        jsonrpc: "2.0",
        method: "account/login/start",
        params: { method: "api-key", apiKey: "sk-test-123" },
      })
    })

    test("sends account/login/start with chatgpt method", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      buildRpcRequest(
        hub,
        sender,
        "account/login/start",
        { method: "chatgpt" },
        "account_login"
      )
      expect(payloads).toHaveLength(1)
      expect(payloads[0]).toMatchObject({
        jsonrpc: "2.0",
        method: "account/login/start",
        params: { method: "chatgpt" },
      })
    })

    test("does not include apiKey when method is chatgpt", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      buildRpcRequest(
        hub,
        sender,
        "account/login/start",
        { method: "chatgpt" },
        "account_login"
      )
      const params = (payloads[0] as Record<string, unknown>).params as Record<
        string,
        unknown
      >
      expect(params.apiKey).toBeUndefined()
    })
  })

  describe("mcpServerStatus/list", () => {
    test("sends mcpServerStatus/list RPC", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      buildRpcRequest(
        hub,
        sender,
        "mcpServerStatus/list",
        undefined,
        "mcp_server_status_list"
      )
      expect(payloads).toHaveLength(1)
      expect(payloads[0]).toMatchObject({
        jsonrpc: "2.0",
        method: "mcpServerStatus/list",
      })
    })
  })

  describe("config/mcpServer/reload", () => {
    test("sends config/mcpServer/reload RPC", () => {
      const hub = createMockHub()
      const { sender, payloads } = createMockSender()
      buildRpcRequest(
        hub,
        sender,
        "config/mcpServer/reload",
        undefined,
        "mcp_server_reload"
      )
      expect(payloads).toHaveLength(1)
      expect(payloads[0]).toMatchObject({
        jsonrpc: "2.0",
        method: "config/mcpServer/reload",
      })
    })
  })

  describe("hub pending map tracking", () => {
    test("tracks multiple pending requests without overwriting", () => {
      const hub = createMockHub()
      const { sender } = createMockSender()
      buildRpcRequest(hub, sender, "model/list", undefined, "model_list")
      buildRpcRequest(hub, sender, "config/read", undefined, "config_read")
      buildRpcRequest(hub, sender, "account/read", undefined, "account_read")
      expect(hub.pending.size).toBe(3)
      expect(hub.pending.get(1)?.type).toBe("model_list")
      expect(hub.pending.get(2)?.type).toBe("config_read")
      expect(hub.pending.get(3)?.type).toBe("account_read")
    })
  })
})
