import type { StreamItem, StreamItemType } from "@/lib/stream-items"

const FIXTURE_BASE_TIMESTAMP = Date.UTC(2026, 1, 26, 18, 0, 0)

export const STREAM_PLACEHOLDER_IMAGE_DATA_URI = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="450" viewBox="0 0 900 450"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs><rect width="900" height="450" fill="url(#bg)"/><circle cx="250" cy="170" r="90" fill="#38bdf8" opacity="0.35"/><circle cx="640" cy="260" r="110" fill="#22c55e" opacity="0.28"/><text x="52" y="95" fill="#e2e8f0" font-family="monospace" font-size="30">Codex Playground Snapshot</text><text x="52" y="140" fill="#cbd5e1" font-family="monospace" font-size="19">Stream item rendering reference</text></svg>'
)}`

type StreamItemOverrides = Partial<
  Omit<StreamItem, "data" | "id" | "timestamp" | "type">
> & {
  data?: StreamItem["data"]
  id: string
  timestamp?: number
}

export const createStreamItem = (
  type: StreamItemType,
  overrides: StreamItemOverrides
): StreamItem => ({
  data: {
    ...(overrides.data ?? {}),
  },
  id: overrides.id,
  status: overrides.status ?? "complete",
  timestamp: overrides.timestamp ?? FIXTURE_BASE_TIMESTAMP,
  turnId: overrides.turnId,
  type,
})

export const streamStatusItem = createStreamItem("status", {
  data: {
    message:
      "Connected to the Codex app-server and loaded a synthetic transcript.",
  },
  id: "codex-status-1",
  turnId: "turn-001",
})

export const streamUserMessageItem = createStreamItem("message", {
  data: {
    role: "user",
    text: "Build me a playground route that renders **all stream components** in one place.",
  },
  id: "codex-message-user-1",
  turnId: "turn-001",
})

export const streamAssistantMessageItem = createStreamItem("message", {
  data: {
    role: "assistant",
    text: "Looks good. Keep this route around as a visual QA harness.",
  },
  id: "codex-message-assistant-1",
  turnId: "turn-002",
})

export const streamThinkingItem = createStreamItem("thinking", {
  data: {
    thinking:
      "Reviewing renderers in `components/ui/stream/*` and collecting representative payloads.",
  },
  id: "codex-thinking-1",
  status: "streaming",
  turnId: "turn-001",
})

export const streamReasoningItem = createStreamItem("reasoning", {
  data: {
    summary:
      "Use synthetic data only; no websocket dependency should be required to review UI changes.",
  },
  id: "codex-reasoning-1",
  turnId: "turn-001",
})

export const streamPlanItem = createStreamItem("plan", {
  data: {
    steps: [
      {
        description: "Create dedicated route under `app/playground`.",
        id: "step-1",
        status: "completed",
      },
      {
        description: "Render one item for each stream renderer.",
        id: "step-2",
        status: "completed",
      },
      {
        description: "Add approval callbacks so controls are interactive.",
        id: "step-3",
        status: "in_progress",
      },
    ],
    summary: "Implementation checklist for the playground route:",
  },
  id: "codex-plan-1",
  turnId: "turn-001",
})

export const streamToolCallItem = createStreamItem("tool_call", {
  data: {
    arguments: {
      domains: ["developer.mozilla.org", "nextjs.org"],
      q: "best websocket reconnect strategy",
    },
    callId: "call-web-01",
    toolName: "web.search",
  },
  id: "codex-tool-call-1",
  turnId: "turn-001",
})

export const streamToolResultItem = createStreamItem("tool_result", {
  data: {
    result: {
      findings: [
        "Use jittered exponential backoff.",
        "Treat close code 1000 as terminal.",
        "Heartbeat each active socket to detect stale sessions.",
      ],
    },
  },
  id: "codex-tool-result-1",
  turnId: "turn-001",
})

export const streamToolResultErrorItem = createStreamItem("tool_result", {
  data: {
    error: "Tool execution failed: request timed out.",
    result: {
      retryable: true,
      timeoutMs: 30_000,
    },
  },
  id: "codex-tool-result-error-1",
  status: "error",
  turnId: "turn-001",
})

export const streamWebSearchItem = createStreamItem("web_search", {
  data: {
    action: {
      queries: [
        "websocket reconnect backoff",
        "heartbeat interval ws clients",
        "sse fallback tradeoffs",
      ],
      type: "search_query",
    },
    actionType: "search_query",
    query: "best websocket reconnect strategy",
  },
  id: "codex-web-search-1",
  turnId: "turn-001",
})

export const streamMcpToolCallItem = createStreamItem("mcp_tool_call", {
  data: {
    arguments: {
      project: "agents-ui",
      state: "in_progress",
    },
    name: "list_issues",
    progress: "Fetched issues for the `agents-ui` project.",
    result: [{ identifier: "AG-91" }, { identifier: "AG-94" }],
    server: "linear",
  },
  id: "codex-mcp-tool-1",
  turnId: "turn-001",
})

export const streamCommandExecutionItem = createStreamItem(
  "command_execution",
  {
    data: {
      command: "bun run build",
      exitCode: 0,
      stdout:
        "▲ Next.js 16.1.6\n✓ Compiled successfully\n✓ Generated static pages",
    },
    id: "codex-command-1",
    turnId: "turn-001",
  }
)

export const streamCommandExecutionStreamingItem = createStreamItem(
  "command_execution",
  {
    data: {
      command: "bun x ultracite check",
      stdout: "Checked 312 files.\nRunning rule: noUnusedVariables...",
    },
    id: "codex-command-streaming-1",
    status: "streaming",
    turnId: "turn-001",
  }
)

export const streamFileChangeItem = createStreamItem("file_change", {
  data: {
    changes: [
      { path: "app/playground/page.tsx", type: "created" },
      { path: "components/ui/stream/stream-feed.tsx", type: "reviewed" },
    ],
    diff: "@@ -0,0 +1,12 @@\n+export default function PlaygroundPage() {\n+  return <main>...</main>\n+}",
    status: "applied",
  },
  id: "codex-file-change-1",
  turnId: "turn-001",
})

export const streamImageItem = createStreamItem("image", {
  data: {
    alt: "Generated placeholder preview image",
    caption: "Inline image rendering example for tool output previews.",
    src: STREAM_PLACEHOLDER_IMAGE_DATA_URI,
  },
  id: "codex-image-1",
  turnId: "turn-001",
})

export const streamCollabAgentItem = createStreamItem("collab_agent", {
  data: {
    agent: { name: "awaiter" },
    status: "completed",
    summary: "Ran `bun run build` and reported successful completion.",
  },
  id: "codex-collab-1",
  turnId: "turn-001",
})

export const streamApprovalCommandItem = createStreamItem("approval_request", {
  data: {
    command: "bun run build",
    path: "/Users/lume/Documents/Code/agents-ui",
    requestMethod: "item/commandExecution/requestApproval",
    requestType: "command",
    text: "Allow execution of build verification in this workspace?",
    title: "Command Approval",
  },
  id: "codex-approval-command-1",
  status: "streaming",
  turnId: "turn-001",
})

export const streamApprovalUserInputItem = createStreamItem(
  "approval_request",
  {
    data: {
      inputPlaceholder: "Type a value",
      params: {
        questions: [
          {
            header: "Release channel",
            id: "release",
            options: [
              {
                description: "Ship to internal users first",
                label: "beta",
              },
              {
                description: "Ship directly to everyone",
                label: "stable",
              },
            ],
            question: "Pick one option.",
          },
          {
            header: "Review focus",
            id: "focus",
            question: "What should QA look at first?",
          },
        ],
      },
      requestMethod: "item/tool/requestUserInput",
      text: "Which release channel should this UI update target?",
      title: "User Input Request",
    },
    id: "codex-approval-input-1",
    turnId: "turn-001",
  }
)

export const streamReviewModeEnabledItem = createStreamItem("review_mode", {
  data: {
    active: true,
    message:
      "Review mode enabled: prioritize findings, regressions, and missing test coverage.",
  },
  id: "codex-review-enabled-1",
  turnId: "turn-001",
})

export const streamReviewModeDisabledItem = createStreamItem("review_mode", {
  data: {
    active: false,
    message: "Review mode disabled. Continue with normal implementation flow.",
  },
  id: "codex-review-disabled-1",
  turnId: "turn-001",
})

export const streamErrorItem = createStreamItem("error", {
  data: {
    code: "WS_EARLY_CLOSE",
    details: {
      closeCode: 1006,
      reconnectScheduledInMs: 1500,
    },
    message: "Socket closed unexpectedly while waiting for a delta update.",
  },
  id: "codex-error-1",
  status: "error",
  turnId: "turn-001",
})

export const streamTurnCompleteItem = createStreamItem("turn_complete", {
  data: {
    costUsd: 0.0193,
    durationMs: 8420,
    summary: "First synthetic turn complete",
  },
  id: "codex-complete-1",
  turnId: "turn-001",
})

export const streamTurnDiffItem = createStreamItem("turn_diff", {
  data: {
    diff: "--- a/src/main.ts\n+++ b/src/main.ts\n@@ -1,3 +1,3 @@\n-const greeting = 'hello'\n+const greeting = 'hello world'\n console.log(greeting)",
    label: "Turn Diff",
  },
  id: "codex-turn-diff-1",
  turnId: "turn-001",
})

export const streamRawItem = createStreamItem("raw_item", {
  data: {
    method: "item/unknown/customEvent",
    payload: {
      flags: ["verbose", "debug"],
      sample: true,
      stage: "playground",
    },
  },
  id: "codex-raw-1",
  turnId: "turn-001",
})

export const streamItemsByType: Record<StreamItemType, StreamItem> = {
  approval_request: streamApprovalCommandItem,
  collab_agent: streamCollabAgentItem,
  command_execution: streamCommandExecutionItem,
  error: streamErrorItem,
  file_change: streamFileChangeItem,
  image: streamImageItem,
  mcp_tool_call: streamMcpToolCallItem,
  message: streamAssistantMessageItem,
  plan: streamPlanItem,
  raw_item: streamRawItem,
  reasoning: streamReasoningItem,
  review_mode: streamReviewModeEnabledItem,
  status: streamStatusItem,
  thinking: streamThinkingItem,
  tool_call: streamToolCallItem,
  tool_result: streamToolResultItem,
  turn_complete: streamTurnCompleteItem,
  turn_diff: streamTurnDiffItem,
  web_search: streamWebSearchItem,
}

export const mixedFeedTranscript: readonly StreamItem[] = [
  streamStatusItem,
  streamUserMessageItem,
  streamThinkingItem,
  streamPlanItem,
  streamReasoningItem,
  streamToolCallItem,
  streamWebSearchItem,
  streamToolResultItem,
  streamMcpToolCallItem,
  streamCommandExecutionItem,
  streamFileChangeItem,
  streamImageItem,
  streamCollabAgentItem,
  streamApprovalCommandItem,
  streamApprovalUserInputItem,
  streamReviewModeEnabledItem,
  streamErrorItem,
  streamRawItem,
  streamTurnCompleteItem,
  streamAssistantMessageItem,
]

export const emptyFeedTranscript: readonly StreamItem[] = []
