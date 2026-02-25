// Mock Codex app-server for testing stale mapping + first-stream issues.
// Run: bun run test-mock-codex.ts
// It listens on port 4500 and simulates the Codex JSON-RPC protocol.
//
// Realistic mode (default): behaves like the real codex app-server.
// - Does NOT respond to thread/loaded/list or addConversationListener.
// - Automatically sends a turn after initialized, without waiting for
//   thread/start or subscription from the client.
//
// Streaming controls (optional env vars):
// - MOCK_WORDS: total target words in one turn (default: 2800)
// - MOCK_CHUNK_SIZE: max characters per text delta (default: 120)
// - MOCK_CHUNK_INTERVAL_MS: delay between deltas (default: 70ms)
// - MOCK_TOOL_CALLS: number of tool calls to emit per turn (default: 3)
// - MOCK_TOOL_EVENT_INTERVAL_MS: delay between tool-call events (default: 45ms)

import { WebSocket, WebSocketServer } from "ws"

const PORT = Number(process.env.PORT) || 4500
const THREAD_ID =
  process.env.THREAD_ID ??
  `test-thread-${Math.random().toString(36).slice(2, 8)}`
let turnCounter = 0
const TARGET_WORD_COUNT = readPositiveInt("MOCK_WORDS", 2800)
const STREAM_CHUNK_SIZE = readPositiveInt("MOCK_CHUNK_SIZE", 120)
const STREAM_CHUNK_INTERVAL_MS = readPositiveInt("MOCK_CHUNK_INTERVAL_MS", 70)
const MOCK_TOOL_CALLS_PER_TURN = readNonNegativeInt("MOCK_TOOL_CALLS", 3)
const TOOL_EVENT_INTERVAL_MS = readPositiveInt(
  "MOCK_TOOL_EVENT_INTERVAL_MS",
  45
)
const STREAM_START_DELAY_MS = 200
const WORD_SPLIT_RE = /\s+/

const MOCK_SECTION_TEMPLATES = [
  `## Section {{SECTION}}: Session framing
Thread \`{{THREAD_ID}}\` is operating in an offline simulation mode so the frontend can be tuned without calling paid endpoints. The goal is to stress rendering behavior, scroll anchoring, markdown formatting, and streamed updates under sustained output volume. This section intentionally includes complete sentences with varied punctuation and sentence length to mimic a real assistant response rather than synthetic gibberish.

The implementation focus for this pass is resilience. We want predictable rendering when the user resizes the viewport, switches tabs, reconnects sockets, or keeps multiple agent panes active. We also want to confirm that incremental text remains readable while events arrive quickly.

### Constraints checklist
- Keep latency low enough to feel like live output.
- Keep chunk boundaries small enough to exercise reducer logic.
- Keep language realistic enough to surface typography issues.
- Keep protocol events valid for existing routing code.`,
  `## Section {{SECTION}}: Product and UX notes
The current panel should handle long-form outputs that include headings, bullet points, code fences, and tables. This lets designers iterate on spacing, hierarchy, and visual rhythm without waiting on external model calls. The transcript below repeats this pattern to generate enough material for realistic QA.

### Visual QA observations
1. Headings should be clearly separated from paragraph text.
2. Monospace blocks should wrap or scroll consistently across device sizes.
3. List indentation must stay aligned while content streams.
4. Adjacent sections should maintain predictable vertical rhythm.

> Streaming text is intentionally verbose to expose clipping, overflow, and jitter.`,
  `## Section {{SECTION}}: Engineering detail
When deltas arrive quickly, the reducer must append text deterministically and mark message completion once \`item/completed\` appears. If completion events are delayed or dropped, the UI should avoid duplicate separators and preserve continuity. This mock transcript is designed to repeatedly hit that append path.

\`\`\`ts
interface MockTurnHealth {
  chunkCount: number
  totalChars: number
  reconnectSafe: boolean
}

const health: MockTurnHealth = {
  chunkCount: 0,
  totalChars: 0,
  reconnectSafe: true,
}
\`\`\`

The snippet above is static markdown content that helps validate code fence styling and syntax highlighting fallback behavior.`,
  `## Section {{SECTION}}: Risk and mitigation
Long transcripts can reveal subtle issues in copy, selection, and keyboard navigation. They can also expose performance regressions caused by repeated concatenation or frequent rerenders. This block exists to keep pressure on those code paths.

| Risk | Symptom | Mitigation |
| --- | --- | --- |
| Excessive rerenders | Typing lag or scroll stutter | Batch updates and memoize derived state |
| Inconsistent wrapping | Horizontal overflow | Validate container width and markdown styles |
| Boundary duplication | Repeated separators | Gate completion markers with state flags |
| Lost context on reconnect | Thread appears empty | Rehydrate state from buffered deltas |

Maintaining this table in the stream helps exercise markdown parsing and table rendering behavior during continuous updates.`,
  `## Section {{SECTION}}: Practical acceptance criteria
The UI should remain stable while this mock text streams for an extended period. The transcript should be legible, the viewport should remain controllable, and switching between agents should not lose the most recent content. These checks are much easier to repeat when output is generated locally.

### Acceptance criteria
- Stream starts within one second after initialization.
- At least one multi-thousand-word message renders without truncation.
- Completion events append exactly one message boundary.
- Re-running the mock server produces deterministic protocol events.

This section closes with additional prose so that each cycle contributes meaningful volume and keeps stress-testing the same surface area in the interface.`,
] as const

interface MockToolCallTemplate {
  command: string
  exitCode: number
  outputLines: readonly string[]
}

const MOCK_TOOL_CALL_TEMPLATES: readonly MockToolCallTemplate[] = [
  {
    command: 'rg -n "codex/event/exec_command" app/page.tsx',
    exitCode: 0,
    outputLines: [
      '1723:        case "codex/event/exec_command_output_delta":\n',
      '1724:        case "codex/event/exec_command_begin":\n',
      '1725:        case "codex/event/exec_command_end":\n',
    ],
  },
  {
    command: "bun x ultracite check test-mock-codex.ts",
    exitCode: 0,
    outputLines: [
      "Checked 1 file in 5ms. No fixes applied.\n",
      "All formatting and lint checks passed.\n",
    ],
  },
  {
    command: "bun test lib/stream-output.test.ts",
    exitCode: 0,
    outputLines: ["8 pass\n", "0 fail\n", "Ran 8 tests across 1 file.\n"],
  },
] as const

const wss = new WebSocketServer({ port: PORT })

console.log(`Mock Codex server listening on port ${PORT}`)
console.log(`Thread ID: ${THREAD_ID}`)
console.log(
  `Mock stream config: words=${TARGET_WORD_COUNT}, chunkSize=${STREAM_CHUNK_SIZE}, intervalMs=${STREAM_CHUNK_INTERVAL_MS}`
)
console.log(
  `Mock tool-call config: calls=${MOCK_TOOL_CALLS_PER_TURN}, eventIntervalMs=${TOOL_EVENT_INTERVAL_MS}`
)

wss.on("connection", (ws) => {
  console.log("Client connected")

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString())
    console.log("Received:", JSON.stringify(msg, null, 2))

    // Handle initialize
    if (msg.method === "initialize") {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            serverInfo: { name: "mock-codex", version: "0.1.0" },
            capabilities: {},
          },
        })
      )
      return
    }

    // Handle initialized notification — start sending output immediately
    if (msg.method === "initialized") {
      setTimeout(() => simulateTurn(ws), 500)
      return
    }

    // Handle thread/start
    if (msg.method === "thread/start") {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          result: { thread: { id: THREAD_ID }, id: THREAD_ID },
        })
      )
      setTimeout(() => simulateTurn(ws), 500)
      return
    }

    // Ignore thread/loaded/list (real server doesn't support it)
    if (msg.method === "thread/loaded/list") {
      console.log("Ignoring thread/loaded/list (not supported)")
      return
    }

    // Ignore addConversationListener (real server doesn't support it)
    if (msg.method === "addConversationListener") {
      console.log("Ignoring addConversationListener (not supported)")
      return
    }

    // Handle thread/read
    if (msg.method === "thread/read") {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          result: { thread: { preview: "Test Thread" } },
        })
      )
      return
    }

    // Handle turn/start
    if (msg.method === "turn/start") {
      const turnId = `turn-${++turnCounter}`
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          result: { id: turnId },
        })
      )
      setTimeout(() => simulateTurn(ws, turnId), 300)
      return
    }

    console.log("Unhandled method:", msg.method)
  })

  ws.on("close", () => {
    console.log("Client disconnected")
  })
})

function simulateTurn(ws: WebSocket, existingTurnId?: string) {
  if (ws.readyState !== WebSocket.OPEN) {
    return
  }

  const turnId = existingTurnId ?? `turn-auto-${++turnCounter}`

  if (!existingTurnId) {
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "turn/started",
        params: { id: turnId, threadId: THREAD_ID, turnId },
      })
    )
  }

  const fullTranscript = buildMockTranscript(THREAD_ID, TARGET_WORD_COUNT)
  const messages = splitTextForStreaming(fullTranscript, STREAM_CHUNK_SIZE)
  console.log(
    `Streaming turn ${turnId}: ${messages.length} chunks, ${fullTranscript.length} chars`
  )

  let delay = STREAM_START_DELAY_MS
  for (const text of messages) {
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        return
      }
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "item/agentMessage/delta",
          params: { turnId, threadId: THREAD_ID, text },
        })
      )
    }, delay)
    delay += STREAM_CHUNK_INTERVAL_MS
  }

  let latestDelay = delay
  const toolCallCount = Math.min(
    MOCK_TOOL_CALLS_PER_TURN,
    MOCK_TOOL_CALL_TEMPLATES.length
  )
  if (toolCallCount > 0) {
    // Schedule tool calls early so they are visible quickly in the UI,
    // even when the mocked assistant transcript is very long.
    const firstToolDelay =
      STREAM_START_DELAY_MS + Math.min(700, STREAM_CHUNK_INTERVAL_MS * 8)
    const toolStartSpacingMs = Math.max(TOOL_EVENT_INTERVAL_MS * 6, 450)
    for (let index = 0; index < toolCallCount; index += 1) {
      const startDelay = firstToolDelay + index * toolStartSpacingMs
      const toolTemplate = MOCK_TOOL_CALL_TEMPLATES[index]
      const toolEndDelay = scheduleToolCallNotifications(
        ws,
        turnId,
        THREAD_ID,
        startDelay,
        toolTemplate,
        index
      )
      if (toolEndDelay > latestDelay) {
        latestDelay = toolEndDelay
      }
    }
  }

  setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      return
    }
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "item/completed",
        params: { turnId, threadId: THREAD_ID },
      })
    )
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: { id: turnId, threadId: THREAD_ID, turnId },
      })
    )
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "codex/event/task_complete",
        params: { threadId: THREAD_ID, turnId },
      })
    )
    console.log(`Turn ${turnId} completed (task_complete sent)`)
  }, latestDelay + STREAM_CHUNK_INTERVAL_MS)
}

function readPositiveInt(envName: string, fallback: number): number {
  const raw = process.env[envName]
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function readNonNegativeInt(envName: string, fallback: number): number {
  const raw = process.env[envName]
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return parsed
}

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) {
    return 0
  }
  return trimmed.split(WORD_SPLIT_RE).length
}

function renderTemplate(
  template: string,
  sectionNumber: number,
  threadId: string
): string {
  return template
    .replaceAll("{{SECTION}}", String(sectionNumber))
    .replaceAll("{{THREAD_ID}}", threadId)
}

function buildMockTranscript(threadId: string, targetWords: number): string {
  const intro = `# Mock Codex Long-Form Output
Thread: \`${threadId}\`

This response is intentionally large to help UI development without paid model usage.
It contains repeated markdown structures, code fences, lists, and tables to stress streaming and rendering behavior.
`

  const parts = [intro]
  let words = countWords(intro)
  let sectionNumber = 1
  while (words < targetWords) {
    const template =
      MOCK_SECTION_TEMPLATES[
        (sectionNumber - 1) % MOCK_SECTION_TEMPLATES.length
      ]
    const section = renderTemplate(template, sectionNumber, threadId)
    parts.push(section)
    words += countWords(section)
    sectionNumber += 1
  }

  parts.push(
    "## Final note\nThis marks the end of the generated mock transcript for the current turn."
  )
  return `${parts.join("\n\n")}\n`
}

function splitTextForStreaming(text: string, chunkSize: number): string[] {
  if (text.length <= chunkSize) {
    return [text]
  }

  const chunks: string[] = []
  let index = 0
  while (index < text.length) {
    let nextIndex = Math.min(index + chunkSize, text.length)
    if (nextIndex < text.length) {
      const splitAt = text.lastIndexOf(" ", nextIndex)
      const minimumChunkSize = index + Math.floor(chunkSize * 0.6)
      if (splitAt > minimumChunkSize) {
        nextIndex = splitAt + 1
      }
    }

    chunks.push(text.slice(index, nextIndex))
    index = nextIndex
  }

  return chunks
}

function scheduleToolCallNotifications(
  ws: WebSocket,
  turnId: string,
  threadId: string,
  startDelay: number,
  toolTemplate: MockToolCallTemplate,
  toolIndex: number
): number {
  const commandId = `${turnId}-cmd-${toolIndex + 1}`
  const commandMethod =
    toolIndex % 2 === 0
      ? "codex/event/exec_command_output_delta"
      : "item/commandExecution/outputDelta"

  scheduleNotification(ws, startDelay, "codex/event/exec_command_begin", {
    threadId,
    turnId,
    id: commandId,
    command: toolTemplate.command,
  })

  let delay = startDelay + TOOL_EVENT_INTERVAL_MS
  for (const outputLine of toolTemplate.outputLines) {
    scheduleNotification(ws, delay, commandMethod, {
      threadId,
      turnId,
      id: commandId,
      delta: outputLine,
      text: outputLine,
    })
    delay += TOOL_EVENT_INTERVAL_MS
  }

  scheduleNotification(ws, delay, "codex/event/exec_command_end", {
    threadId,
    turnId,
    id: commandId,
    command: toolTemplate.command,
    exitCode: toolTemplate.exitCode,
    status: toolTemplate.exitCode === 0 ? "completed" : "failed",
  })
  return delay + TOOL_EVENT_INTERVAL_MS
}

function scheduleNotification(
  ws: WebSocket,
  delay: number,
  method: string,
  params: Record<string, unknown>
): void {
  setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      return
    }
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      })
    )
  }, delay)
}
