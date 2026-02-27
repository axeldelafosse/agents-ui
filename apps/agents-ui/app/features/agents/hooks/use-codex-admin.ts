"use client"

import { codexHubs } from "@axel-delafosse/agent-runtime/runtime-state"
import type { CodexHub } from "@axel-delafosse/agent-runtime/types"
import { useCallback, useMemo } from "react"
import {
  type CodexAdminRpcSender,
  requestAccountLoginCancel,
  requestAccountLoginStart,
  requestAccountLogout,
  requestAccountRateLimitsRead,
  requestAccountRead,
  requestConfigBatchWrite,
  requestConfigRead,
  requestConfigRequirementsRead,
  requestConfigValueWrite,
  requestMcpServerOauthLogin,
  requestMcpServerReload,
  requestMcpServerStatusList,
  requestModelList,
} from "@/lib/codex-admin-rpc"

interface UseCodexAdminParams {
  sendCodexPayload: (hub: CodexHub, payload: unknown, agentId?: string) => void
}

export function useCodexAdmin({ sendCodexPayload }: UseCodexAdminParams) {
  const sender: CodexAdminRpcSender = useMemo(
    () => ({
      sendPayload: sendCodexPayload,
      nextRpcId: (hub: CodexHub) => {
        hub.rpcId++
        return hub.rpcId
      },
    }),
    [sendCodexPayload]
  )

  const findHub = useCallback((hubUrl: string): CodexHub | undefined => {
    return codexHubs.get(hubUrl)
  }, [])

  const modelList = useCallback(
    (hubUrl: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestModelList(hub, sender)
    },
    [findHub, sender]
  )

  const configRead = useCallback(
    (hubUrl: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestConfigRead(hub, sender)
    },
    [findHub, sender]
  )

  const configRequirementsRead = useCallback(
    (hubUrl: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestConfigRequirementsRead(hub, sender)
    },
    [findHub, sender]
  )

  const accountRead = useCallback(
    (hubUrl: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestAccountRead(hub, sender)
    },
    [findHub, sender]
  )

  const accountRateLimitsRead = useCallback(
    (hubUrl: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestAccountRateLimitsRead(hub, sender)
    },
    [findHub, sender]
  )

  const configValueWrite = useCallback(
    (hubUrl: string, key: string, value: unknown) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestConfigValueWrite(hub, sender, key, value)
    },
    [findHub, sender]
  )

  const configBatchWrite = useCallback(
    (hubUrl: string, edits: Array<{ key: string; value: unknown }>) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestConfigBatchWrite(hub, sender, edits)
    },
    [findHub, sender]
  )

  const accountLoginStart = useCallback(
    (hubUrl: string, method: "api-key" | "chatgpt", apiKey?: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestAccountLoginStart(hub, sender, method, apiKey)
    },
    [findHub, sender]
  )

  const accountLoginCancel = useCallback(
    (hubUrl: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestAccountLoginCancel(hub, sender)
    },
    [findHub, sender]
  )

  const accountLogout = useCallback(
    (hubUrl: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestAccountLogout(hub, sender)
    },
    [findHub, sender]
  )

  const mcpServerStatusList = useCallback(
    (hubUrl: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestMcpServerStatusList(hub, sender)
    },
    [findHub, sender]
  )

  const mcpServerOauthLogin = useCallback(
    (hubUrl: string, serverId: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestMcpServerOauthLogin(hub, sender, serverId)
    },
    [findHub, sender]
  )

  const mcpServerReload = useCallback(
    (hubUrl: string) => {
      const hub = findHub(hubUrl)
      if (!hub?.initialized) {
        return
      }
      requestMcpServerReload(hub, sender)
    },
    [findHub, sender]
  )

  return {
    accountLoginCancel,
    accountLoginStart,
    accountLogout,
    accountRateLimitsRead,
    accountRead,
    configBatchWrite,
    configRead,
    configRequirementsRead,
    configValueWrite,
    mcpServerOauthLogin,
    mcpServerReload,
    mcpServerStatusList,
    modelList,
  }
}
