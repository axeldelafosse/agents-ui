"use client"

import {
  type CapturedAgentSnapshot,
  type ChatCaptureSnapshot,
  latestChatCapture,
} from "@axel-delafosse/agent-runtime/capture"
import { hostFromUrl } from "@axel-delafosse/agent-runtime/tab-utils"
import type { AgentTab } from "@axel-delafosse/agent-runtime/types"
import { Shimmer } from "@axel-delafosse/ui/shimmer"
import type {
  StreamApprovalInputValue,
  StreamItem,
} from "@axel-delafosse/ui/types"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AgentTabBar } from "@/components/ui/agent-tab-bar"

const CODEX_TAB_ID = "tab-codex-playground"
const CLAUDE_TAB_ID = "tab-claude-playground"
const EMPTY_TAB_ID = "tab-empty-playground"
const CAPTURE_TAB_PREFIX = "capture:"
const BASE_TIMESTAMP = Date.UTC(2026, 1, 26, 18, 0, 0)
const PLACEHOLDER_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="450" viewBox="0 0 900 450"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs><rect width="900" height="450" fill="url(#bg)"/><circle cx="250" cy="170" r="90" fill="#38bdf8" opacity="0.35"/><circle cx="640" cy="260" r="110" fill="#22c55e" opacity="0.28"/><text x="52" y="95" fill="#e2e8f0" font-family="monospace" font-size="30">Codex Playground Snapshot</text><text x="52" y="140" fill="#cbd5e1" font-family="monospace" font-size="19">Stream item rendering reference</text></svg>'
)}`

const Feed = dynamic(
  () => import("@axel-delafosse/ui/feed").then((module) => module.Feed),
  {
    ssr: false,
  }
)

const captureTabId = (captureId: string, agentId: string): string =>
  `${CAPTURE_TAB_PREFIX}${captureId}:${agentId}`

const parseCaptureTabId = (
  tabId: string
): { agentId: string; captureId: string } | undefined => {
  if (!tabId.startsWith(CAPTURE_TAB_PREFIX)) {
    return undefined
  }
  const payload = tabId.slice(CAPTURE_TAB_PREFIX.length)
  const splitIndex = payload.indexOf(":")
  if (splitIndex <= 0 || splitIndex >= payload.length - 1) {
    return undefined
  }
  return {
    agentId: payload.slice(splitIndex + 1),
    captureId: payload.slice(0, splitIndex),
  }
}

const PLAYGROUND_TABS: AgentTab[] = [
  {
    id: CODEX_TAB_ID,
    identityId: "thread-playground-codex",
    representative: {
      id: "agent-codex-playground",
      output: "",
      protocol: "codex",
      status: "connected",
      streamItems: [],
      threadId: "thread-playground-codex",
      threadName: "Playground QA Thread",
      url: "ws://localhost:4500/codex",
    },
    agents: [],
  },
  {
    id: CLAUDE_TAB_ID,
    identityId: "sess-playground-claude",
    representative: {
      id: "agent-claude-playground",
      output: "",
      protocol: "claude",
      sessionId: "sess-playground-claude",
      status: "reconnecting",
      streamItems: [],
      url: "ws://localhost:8765/claude",
    },
    agents: [],
  },
]

const TRANSCRIPTS_BY_TAB: Record<string, readonly StreamItem[]> = {
  [CODEX_TAB_ID]: [
    {
      id: "codex-status-1",
      type: "status",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 1000,
      turnId: "turn-001",
      data: {
        message:
          "Connected to the Codex app-server and loaded a synthetic transcript.",
      },
    },
    {
      id: "codex-message-1",
      type: "message",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 2000,
      turnId: "turn-001",
      data: {
        role: "user",
        text: "Build me a playground route that renders **all stream components** in one place.",
      },
    },
    {
      id: "codex-thinking-1",
      type: "thinking",
      status: "streaming",
      timestamp: BASE_TIMESTAMP + 3000,
      turnId: "turn-001",
      data: {
        thinking:
          "Reviewing renderers in `*` and collecting representative payloads.",
      },
    },
    {
      id: "codex-plan-1",
      type: "plan",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 4000,
      turnId: "turn-001",
      data: {
        summary: "Implementation checklist for the playground route:",
        steps: [
          {
            id: "step-1",
            description: "Create dedicated route under `app/playground`.",
            status: "completed",
          },
          {
            id: "step-2",
            description: "Render one item for each stream renderer.",
            status: "completed",
          },
          {
            id: "step-3",
            description: "Add approval callbacks so controls are interactive.",
            status: "in_progress",
          },
        ],
      },
    },
    {
      id: "codex-reasoning-1",
      type: "reasoning",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 5000,
      turnId: "turn-001",
      data: {
        summary:
          "Use synthetic data only; no websocket dependency should be required to review UI changes.",
        raw: {
          checks: ["type coverage", "approval interaction", "turn boundaries"],
          confidence: "high",
        },
      },
    },
    {
      id: "codex-tool-call-1",
      type: "tool_call",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 6000,
      turnId: "turn-001",
      data: {
        toolName: "web.search",
        callId: "call-web-01",
        arguments: {
          q: "best websocket reconnect strategy",
          domains: ["developer.mozilla.org", "nextjs.org"],
        },
      },
    },
    {
      id: "codex-web-search-1",
      type: "web_search",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 7000,
      turnId: "turn-001",
      data: {
        query: "best websocket reconnect strategy",
        actionType: "search_query",
        action: {
          type: "search_query",
          queries: [
            "websocket reconnect backoff",
            "heartbeat interval ws clients",
            "sse fallback tradeoffs",
          ],
        },
      },
    },
    {
      id: "codex-tool-result-1",
      type: "tool_result",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 8000,
      turnId: "turn-001",
      data: {
        result: {
          findings: [
            "Use jittered exponential backoff.",
            "Treat close code 1000 as terminal.",
            "Heartbeat each active socket to detect stale sessions.",
          ],
        },
      },
    },
    {
      id: "codex-mcp-tool-1",
      type: "mcp_tool_call",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 9000,
      turnId: "turn-001",
      data: {
        server: "linear",
        name: "list_issues",
        progress: "Fetched issues for the `agents-ui` project.",
        arguments: {
          project: "agents-ui",
          state: "in_progress",
        },
        result: [{ identifier: "AG-91" }, { identifier: "AG-94" }],
      },
    },
    {
      id: "codex-command-1",
      type: "command_execution",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 10_000,
      turnId: "turn-001",
      data: {
        command: "bun run build",
        stdout:
          "▲ Next.js 16.1.6\n✓ Compiled successfully\n✓ Generated static pages",
        exitCode: 0,
      },
    },
    {
      id: "codex-file-change-1",
      type: "file_change",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 11_000,
      turnId: "turn-001",
      data: {
        status: "applied",
        changes: [
          { path: "app/playground/page.tsx", type: "created" },
          { path: "feed.tsx", type: "reviewed" },
        ],
        diff: "@@ -0,0 +1,12 @@\n+export default function PlaygroundPage() {\n+  return <main>...</main>\n+}",
      },
    },
    {
      id: "codex-image-1",
      type: "image",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 12_000,
      turnId: "turn-001",
      data: {
        src: PLACEHOLDER_IMAGE,
        alt: "Generated placeholder preview image",
        caption: "Inline image rendering example for tool output previews.",
      },
    },
    {
      id: "codex-collab-1",
      type: "collab_agent",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 13_000,
      turnId: "turn-001",
      data: {
        agent: { name: "awaiter" },
        status: "completed",
        summary: "Ran `bun run build` and reported successful completion.",
      },
    },
    {
      id: "codex-approval-1",
      type: "approval_request",
      status: "streaming",
      timestamp: BASE_TIMESTAMP + 14_000,
      turnId: "turn-001",
      data: {
        title: "Command Approval",
        text: "Allow execution of build verification in this workspace?",
        requestMethod: "item/commandExecution/requestApproval",
        requestType: "command",
        command: "bun run build",
        path: "/Users/axel/Documents/Code/agents-ui",
      },
    },
    {
      id: "codex-approval-2",
      type: "approval_request",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 15_000,
      turnId: "turn-001",
      data: {
        title: "User Input Request",
        text: "Which release channel should this UI update target?",
        requestMethod: "item/tool/requestUserInput",
        params: {
          questions: [
            {
              id: "release",
              header: "Release channel",
              question: "Pick one option.",
              options: [
                {
                  label: "beta",
                  description: "Ship to internal users first",
                },
                {
                  label: "stable",
                  description: "Ship directly to everyone",
                },
              ],
            },
            {
              id: "focus",
              header: "Review focus",
              question: "What should QA look at first?",
            },
          ],
        },
        inputPlaceholder: "Type a value",
      },
    },
    {
      id: "codex-review-1",
      type: "review_mode",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 16_000,
      turnId: "turn-001",
      data: {
        active: true,
        message:
          "Review mode enabled: prioritize findings, regressions, and missing test coverage.",
      },
    },
    {
      id: "codex-error-1",
      type: "error",
      status: "error",
      timestamp: BASE_TIMESTAMP + 17_000,
      turnId: "turn-001",
      data: {
        message: "Socket closed unexpectedly while waiting for a delta update.",
        code: "WS_EARLY_CLOSE",
        details: {
          closeCode: 1006,
          reconnectScheduledInMs: 1500,
        },
      },
    },
    {
      id: "codex-raw-1",
      type: "raw_item",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 18_000,
      turnId: "turn-001",
      data: {
        method: "item/unknown/customEvent",
        payload: {
          stage: "playground",
          flags: ["verbose", "debug"],
          sample: true,
        },
      },
    },
    {
      id: "codex-complete-1",
      type: "turn_complete",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 19_000,
      turnId: "turn-001",
      data: {
        summary: "First synthetic turn complete",
        durationMs: 8420,
        costUsd: 0.0193,
      },
    },
    {
      id: "codex-status-2",
      type: "status",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 20_000,
      turnId: "turn-002",
      data: {
        message: "Starting a second turn to show transcript boundaries.",
      },
    },
    {
      id: "codex-message-2",
      type: "message",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 21_000,
      turnId: "turn-002",
      data: {
        role: "assistant",
        text: "Looks good. Keep this route around as a visual QA harness.",
      },
    },
    {
      id: "codex-complete-2",
      type: "turn_complete",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 22_000,
      turnId: "turn-002",
      data: {
        summary: "Playground transcript ready",
        durationMs: 1280,
      },
    },
  ],
  [CLAUDE_TAB_ID]: [
    {
      id: "claude-status-1",
      type: "status",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 1000,
      turnId: "claude-turn-001",
      data: {
        message: "Claude relay connected. This tab shows a smaller transcript.",
      },
    },
    {
      id: "claude-message-user-1",
      type: "message",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 1500,
      turnId: "claude-turn-001",
      data: {
        role: "user",
        text: "Show me how user prompts look in this transcript.",
      },
    },
    {
      id: "claude-message-1",
      type: "message",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 2000,
      turnId: "claude-turn-001",
      data: {
        role: "assistant",
        text: "I can also render a standard Claude session alongside Codex.",
      },
    },
    {
      id: "claude-tool-call-1",
      type: "tool_call",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 3000,
      turnId: "claude-turn-001",
      data: {
        name: "Bash",
        partial_json: '{"command":"ls -la"}',
      },
    },
    {
      id: "claude-tool-result-1",
      type: "tool_result",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 4000,
      turnId: "claude-turn-001",
      data: {
        result: "total 128\n-rw-r--r-- app/page.tsx",
      },
    },
    {
      id: "claude-complete-1",
      type: "turn_complete",
      status: "complete",
      timestamp: BASE_TIMESTAMP + 5000,
      turnId: "claude-turn-001",
      data: {
        result: "Claude demo turn complete.",
        durationMs: 1960,
      },
    },
  ],
  [EMPTY_TAB_ID]: [],
}

const cloneStreamItems = (items: readonly StreamItem[]): StreamItem[] =>
  items.map((item) => ({
    ...item,
    data: { ...item.data },
  }))

const loadPlaygroundTranscript = (tabId: string): StreamItem[] =>
  cloneStreamItems(TRANSCRIPTS_BY_TAB[tabId] ?? [])

const captureTabs = (capture: ChatCaptureSnapshot | null): AgentTab[] => {
  if (!capture) {
    return []
  }
  return capture.agents.map((agent) => ({
    agents: [],
    id: captureTabId(capture.id, agent.id),
    identityId: agent.protocol === "claude" ? agent.sessionId : agent.threadId,
    representative: {
      id: `${agent.id}-capture-representative`,
      output: agent.output,
      protocol: agent.protocol,
      sessionId: agent.sessionId,
      status: agent.status,
      streamItems: cloneStreamItems(agent.streamItems),
      threadId: agent.threadId,
      threadName: agent.threadName,
      url: agent.url,
    },
  }))
}

const findCapturedAgent = (
  tabId: string,
  capture: ChatCaptureSnapshot | null
): CapturedAgentSnapshot | undefined => {
  const parsed = parseCaptureTabId(tabId)
  if (!(parsed && capture && parsed.captureId === capture.id)) {
    return undefined
  }
  return capture.agents.find((agent) => agent.id === parsed.agentId)
}

const loadTranscript = (
  tabId: string,
  capture: ChatCaptureSnapshot | null
): StreamItem[] => {
  const captured = findCapturedAgent(tabId, capture)
  if (captured) {
    return cloneStreamItems(captured.streamItems)
  }
  return loadPlaygroundTranscript(tabId)
}

const formatInputValue = (value: StreamApprovalInputValue): string => {
  if (typeof value === "string") {
    return value
  }
  return Object.entries(value)
    .map(([key, entry]) => `${key}: ${entry}`)
    .join(" | ")
}

export default function PlaygroundPage() {
  const [capture, setCapture] = useState<ChatCaptureSnapshot | null>(null)
  const [activeTabId, setActiveTabId] = useState<string>(CODEX_TAB_ID)
  const [autoFollow, setAutoFollow] = useState(false)
  const [items, setItems] = useState<StreamItem[]>(() =>
    loadTranscript(CODEX_TAB_ID, null)
  )

  const tabs = useMemo(
    () => [...PLAYGROUND_TABS, ...captureTabs(capture)],
    [capture]
  )

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs]
  )

  const activeHost = hostFromUrl(activeTab.representative.url)

  useEffect(() => {
    const nextCapture = latestChatCapture() ?? null
    setCapture(nextCapture)
  }, [])

  useEffect(() => {
    if (tabs.some((tab) => tab.id === activeTabId)) {
      return
    }
    const fallbackTabId = tabs[0]?.id
    if (!fallbackTabId) {
      return
    }
    setActiveTabId(fallbackTabId)
    setItems(loadTranscript(fallbackTabId, capture))
  }, [activeTabId, capture, tabs])

  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId)
      setItems(loadTranscript(tabId, capture))
    },
    [capture]
  )

  const updateItem = useCallback(
    (targetId: string, updater: (item: StreamItem) => StreamItem) => {
      setItems((current) => {
        const index = current.findIndex((item) => item.id === targetId)
        if (index === -1) {
          return current
        }
        const next = [...current]
        next[index] = updater(next[index])
        return next
      })
    },
    []
  )

  const handleApprove = useCallback(
    (item: StreamItem) => {
      updateItem(item.id, (current) => ({
        ...current,
        status: "complete",
        data: {
          ...current.data,
          message: "Approved from playground UI.",
          reviewState: "approved",
        },
      }))
    },
    [updateItem]
  )

  const handleDeny = useCallback(
    (item: StreamItem) => {
      updateItem(item.id, (current) => ({
        ...current,
        status: "error",
        data: {
          ...current.data,
          message: "Denied from playground UI.",
          reviewState: "denied",
        },
      }))
    },
    [updateItem]
  )

  const handleSubmitInput = useCallback(
    (item: StreamItem, value: StreamApprovalInputValue) => {
      updateItem(item.id, (current) => ({
        ...current,
        status: "complete",
        data: {
          ...current.data,
          message: `Submitted input: ${formatInputValue(value)}`,
          submittedValue: value,
        },
      }))
    },
    [updateItem]
  )

  return (
    <main className="min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="font-bold text-lg tracking-tight">Agents UI</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-right text-sm text-zinc-400">
            {activeTab.representative.protocol} @ {activeHost} (
            {activeTab.representative.status})
          </p>
          <Link
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
            href="/"
          >
            Back to live view
          </Link>
        </div>
      </div>

      <AgentTabBar
        activeTabId={activeTabId}
        autoFollow={autoFollow}
        onAutoFollowChange={setAutoFollow}
        onTabChange={handleTabChange}
        tabs={tabs}
      />

      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <section>
          {items.length > 0 ? (
            <Feed
              items={items}
              onApprove={handleApprove}
              onDeny={handleDeny}
              onSubmitInput={handleSubmitInput}
            />
          ) : (
            <Shimmer className="text-sm" duration={2}>
              No events in this mock session yet.
            </Shimmer>
          )}
        </section>
      </div>
    </main>
  )
}
