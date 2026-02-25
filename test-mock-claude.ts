// Mock Claude relay for UI testing without model credits.
// Run: bun run test-mock-claude.ts
//
// It listens on ws://127.0.0.1:<PORT>/ws and emits Claude-style NDJSON
// messages that match what app/page.tsx expects:
// - status
// - system/init (session_id)
// - stream_event (message_start/content_block_*/message_stop)
// - assistant
// - result
//
// Controls (optional env vars):
// - PORT: relay port (default: 8765)
// - SESSION_ID: fixed session id (default: random mock session)
// - MOCK_WORDS: target words per turn (default: 2600)
// - MOCK_CHUNK_SIZE: max chars per streamed text delta (default: 110)
// - MOCK_CHUNK_INTERVAL_MS: delay between text deltas (default: 55ms)
// - MOCK_TOOL_CALLS: number of visible mock tool sections (default: 2)
// - MOCK_TURNS: automatic turns emitted after connect (default: 1)
// - MOCK_TURN_GAP_MS: delay between automatic turns (default: 2600ms)
// - MOCK_MODEL: model label in system/init (default: claude-sonnet-4-6)

import { WebSocket, WebSocketServer } from "ws"

const PORT = Number(process.env.PORT) || 8765
const SESSION_ID =
  process.env.SESSION_ID ??
  `mock-claude-${Math.random().toString(36).slice(2, 10)}`
const TARGET_WORD_COUNT = readPositiveInt("MOCK_WORDS", 2600)
const STREAM_CHUNK_SIZE = readPositiveInt("MOCK_CHUNK_SIZE", 110)
const STREAM_CHUNK_INTERVAL_MS = readPositiveInt("MOCK_CHUNK_INTERVAL_MS", 55)
const MOCK_TOOL_CALLS_PER_TURN = readNonNegativeInt("MOCK_TOOL_CALLS", 2)
const AUTO_TURN_COUNT = readNonNegativeInt("MOCK_TURNS", 1)
const AUTO_TURN_GAP_MS = readPositiveInt("MOCK_TURN_GAP_MS", 2600)
const MODEL = process.env.MOCK_MODEL?.trim() || "claude-sonnet-4-6"

const WORD_SPLIT_RE = /\s+/
const TURN_START_DELAY_MS = 450
const STREAM_BLOCK_OPEN_DELAY_MS = 40
const STREAM_BLOCK_CLOSE_DELAY_MS = 35

interface MockClaudeClientState {
  sessionId: string
  timers: Set<ReturnType<typeof setTimeout>>
  turnCounter: number
  ws: WebSocket
}

interface MockToolCallTemplate {
  command: string
  exitCode: number
  outputLines: readonly string[]
}

const MOCK_SECTION_TEMPLATES = [
  `## Section {{SECTION}}: Session setup
Session \`{{SESSION_ID}}\` is running in local mock mode so the Claude UI can be tuned without hitting paid endpoints. This response is intentionally long and markdown-heavy to stress scrolling, typography, and streaming delta handling under sustained updates.

### Rendering checklist
- Paragraph flow should remain readable while text streams.
- Markdown headings and bullets should maintain spacing.
- Copy and selection should remain stable across large outputs.
- Message boundaries should appear exactly once per turn.`,
  `## Section {{SECTION}}: UX and behavior notes
The mock output is built to look like real assistant content rather than placeholder filler. It includes natural sentence structure, occasional lists, and varied paragraph lengths so layout regressions are easier to spot.

### Review focus
1. Header hierarchy and text contrast.
2. Code block rendering and wrapping.
3. Long-message scroll behavior.
4. Stability when switching tabs during stream.`,
  `## Section {{SECTION}}: Implementation detail
The simulated stream uses Claude \`stream_event\` payloads with \`content_block_delta\` and \`text_delta\`, then emits \`assistant\` and \`result\` at the end of the turn. This mirrors the real parsing path in the app and helps verify reducer behavior and session routing.

\`\`\`ts
type MockTurnStats = {
  chars: number
  chunks: number
  stableBoundaries: boolean
}

const stats: MockTurnStats = {
  chars: 0,
  chunks: 0,
  stableBoundaries: true,
}
\`\`\`

This code fence is included to exercise markdown rendering under stream updates.`,
  `## Section {{SECTION}}: Performance and risk
Large streamed transcripts can surface subtle issues: content jumpiness, duplicated boundaries, intermittent clipping, or reduced responsiveness under rapid updates. Repeating this section helps keep pressure on those paths during local UI iteration.

| Risk | Symptom | Mitigation |
| --- | --- | --- |
| Excessive rerendering | Scroll jank | Keep updates narrow and state transitions predictable |
| Boundary duplication | Extra blank separators | Guard boundary logic with explicit state flags |
| Late content updates | Missing tail text | Ensure parser handles trailing NDJSON buffers |
| Weak text hierarchy | Hard-to-scan transcript | Validate markdown spacing and heading styles |`,
] as const

const MOCK_TOOL_CALL_TEMPLATES: readonly MockToolCallTemplate[] = [
  {
    command:
      'rg -n "handleClaude|reduceClaudeOutput" app/page.tsx lib/stream-output.ts',
    exitCode: 0,
    outputLines: [
      "1296:  const handleClaudeStatusDisconnect = useCallback(\n",
      "1315:  const handleClaudeMsg = useCallback(\n",
      "625:  const applyClaudeOutputMessage = useCallback(\n",
    ],
  },
  {
    command: "bun test lib/stream-output.test.ts",
    exitCode: 0,
    outputLines: ["8 pass\n", "0 fail\n", "Ran 8 tests across 1 file.\n"],
  },
  {
    command: "bun x ultracite check app/page.tsx",
    exitCode: 0,
    outputLines: [
      "Checked 1 file in 9ms. No fixes applied.\n",
      "No lint or format issues detected.\n",
    ],
  },
] as const

const wss = new WebSocketServer({ path: "/ws", port: PORT })

console.log(`Mock Claude relay listening on ws://127.0.0.1:${PORT}/ws`)
console.log(`Session ID: ${SESSION_ID}`)
console.log(
  `Mock stream config: words=${TARGET_WORD_COUNT}, chunkSize=${STREAM_CHUNK_SIZE}, intervalMs=${STREAM_CHUNK_INTERVAL_MS}`
)
console.log(
  `Mock turn config: turns=${AUTO_TURN_COUNT}, gapMs=${AUTO_TURN_GAP_MS}, toolsPerTurn=${MOCK_TOOL_CALLS_PER_TURN}`
)

wss.on("connection", (ws) => {
  const client: MockClaudeClientState = {
    sessionId: SESSION_ID,
    timers: new Set(),
    turnCounter: 0,
    ws,
  }

  console.log("Frontend connected")

  scheduleClientAction(client, 0, () => {
    sendJson(client.ws, { text: "claude code connected", type: "status" })
  })
  scheduleClientAction(client, 35, () => {
    sendJson(client.ws, { text: "claude code is connected", type: "status" })
  })
  scheduleClientAction(client, 70, () => {
    sendJson(client.ws, {
      model: MODEL,
      session_id: client.sessionId,
      subtype: "init",
      type: "system",
    })
  })

  for (let turnIndex = 0; turnIndex < AUTO_TURN_COUNT; turnIndex += 1) {
    const delay = TURN_START_DELAY_MS + turnIndex * AUTO_TURN_GAP_MS
    scheduleClientAction(client, delay, () => {
      simulateTurn(client)
    })
  }

  ws.on("message", (raw) => {
    // Optional: allow manual "user" messages to trigger additional turns.
    for (const line of raw.toString().split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }
      try {
        const msg = JSON.parse(trimmed) as { type?: string }
        if (msg.type === "user") {
          simulateTurn(client)
        }
      } catch {
        // ignore malformed input in mock mode
      }
    }
  })

  ws.on("close", () => {
    clearClientTimers(client)
    console.log("Frontend disconnected")
  })
})

function simulateTurn(client: MockClaudeClientState): void {
  if (client.ws.readyState !== WebSocket.OPEN) {
    return
  }

  const turnId = `mock-claude-turn-${++client.turnCounter}`
  const toolCallCount = Math.min(
    MOCK_TOOL_CALLS_PER_TURN,
    MOCK_TOOL_CALL_TEMPLATES.length
  )
  const transcript = buildMockTranscript(
    client.sessionId,
    TARGET_WORD_COUNT,
    toolCallCount
  )
  const chunks = splitTextForStreaming(transcript, STREAM_CHUNK_SIZE)
  console.log(
    `Streaming ${turnId}: ${chunks.length} chunks, ${transcript.length} chars`
  )

  let delay = 0

  scheduleClientAction(client, delay, () => {
    sendStreamEvent(client.ws, {
      type: "message_start",
    })
  })
  delay += STREAM_BLOCK_OPEN_DELAY_MS

  scheduleClientAction(client, delay, () => {
    sendStreamEvent(client.ws, {
      content_block: { type: "text" },
      index: 0,
      type: "content_block_start",
    })
  })
  delay += STREAM_BLOCK_OPEN_DELAY_MS

  for (const chunk of chunks) {
    scheduleClientAction(client, delay, () => {
      sendStreamEvent(client.ws, {
        delta: { text: chunk, type: "text_delta" },
        index: 0,
        type: "content_block_delta",
      })
    })
    delay += STREAM_CHUNK_INTERVAL_MS
  }

  scheduleClientAction(client, delay, () => {
    sendStreamEvent(client.ws, {
      index: 0,
      type: "content_block_stop",
    })
  })
  delay += STREAM_BLOCK_CLOSE_DELAY_MS

  scheduleClientAction(client, delay, () => {
    sendStreamEvent(client.ws, { type: "message_stop" })
  })
  delay += STREAM_BLOCK_CLOSE_DELAY_MS

  scheduleClientAction(client, delay, () => {
    sendJson(client.ws, {
      message: {
        content: [{ text: transcript, type: "text" }],
      },
      session_id: client.sessionId,
      type: "assistant",
    })
  })
  delay += STREAM_BLOCK_CLOSE_DELAY_MS

  scheduleClientAction(client, delay, () => {
    sendJson(client.ws, {
      cost_usd: 0,
      duration_ms: delay,
      is_error: false,
      result: `Mock Claude turn complete (${turnId})`,
      session_id: client.sessionId,
      type: "result",
    })
  })
}

function sendStreamEvent(ws: WebSocket, event: Record<string, unknown>): void {
  sendJson(ws, {
    event,
    type: "stream_event",
  })
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return
  }
  ws.send(JSON.stringify(payload))
}

function scheduleClientAction(
  client: MockClaudeClientState,
  delayMs: number,
  action: () => void
): void {
  const timer = setTimeout(() => {
    client.timers.delete(timer)
    action()
  }, delayMs)
  client.timers.add(timer)
}

function clearClientTimers(client: MockClaudeClientState): void {
  for (const timer of client.timers) {
    clearTimeout(timer)
  }
  client.timers.clear()
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
  sessionId: string
): string {
  return template
    .replaceAll("{{SECTION}}", String(sectionNumber))
    .replaceAll("{{SESSION_ID}}", sessionId)
}

function renderToolCallSection(toolCallCount: number): string {
  if (toolCallCount <= 0) {
    return ""
  }

  const lines = ["## Tool Activity (Mock)"]
  for (let index = 0; index < toolCallCount; index += 1) {
    const tool = MOCK_TOOL_CALL_TEMPLATES[index]
    lines.push(`[tool] \`$ ${tool.command}\``)
    lines.push(...tool.outputLines)
    lines.push(`[tool] done completed (exit ${tool.exitCode})`)
    lines.push("")
  }
  return lines.join("\n")
}

function buildMockTranscript(
  sessionId: string,
  targetWords: number,
  toolCallCount: number
): string {
  const intro = `# Mock Claude Long-Form Output
Session: \`${sessionId}\`

This response is intentionally large so the UI can be refined without paying for live model calls.
`
  const toolSection = renderToolCallSection(toolCallCount)

  const parts = [intro]
  let words = countWords(intro)
  if (toolSection) {
    parts.push(toolSection)
    words += countWords(toolSection)
  }

  let sectionNumber = 1
  while (words < targetWords) {
    const template =
      MOCK_SECTION_TEMPLATES[
        (sectionNumber - 1) % MOCK_SECTION_TEMPLATES.length
      ]
    const section = renderTemplate(template, sectionNumber, sessionId)
    parts.push(section)
    words += countWords(section)
    sectionNumber += 1
  }

  parts.push(
    "## Final note\nThis concludes the mock Claude transcript for the current turn."
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
