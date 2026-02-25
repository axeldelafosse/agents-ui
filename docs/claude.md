# Claude Code SDK URL Protocol

The Claude CLI (`claude`) can connect to an external relay server via `--sdk-url`. Communication uses **NDJSON** (newline-delimited JSON) over WebSocket. Unlike Codex (one hub, many threads), Claude uses **one WebSocket per agent** with session-based identity.

## Connection model

Two architectures exist depending on who owns the relay:

### agents-ui relay (`server/index.ts`)

```
Claude CLI ──ws──> Relay (port 8765) <──ws── Frontend (agents-ui)
                        │
                        └── broadcasts to all /ws frontends
```

- Claude CLI connects to `ws://localhost:<port>/` (root path)
- Frontend connects to `ws://localhost:<port>/ws`
- The relay is a **dumb pipe**: it forwards raw NDJSON to all frontends and only intercepts `control_request` for auto-approval

### loop relay (`claude-sdk-server.ts`)

```
Claude CLI ──ws──> loop relay (port 8765-8864) <──ws── Frontend (agents-ui)
                        │
                        └── loop orchestrates turns programmatically
```

- loop spawns `claude` with `--sdk-url ws://localhost:<port>`
- loop's relay also accepts frontend observers on `/ws` (dumb pipe — raw NDJSON forwarded both ways)
- loop sends user messages and receives results programmatically
- loop restarts the Claude process after each turn for session freshness

## Initialization handshake

### 1. Claude CLI connects

The CLI opens a WebSocket to the `--sdk-url` (root path `/`).

### 2. Relay sends `control_request` (initialize)

```json
{
  "type": "control_request",
  "request_id": "<uuid>",
  "request": { "subtype": "initialize" }
}
```

### 3. Claude CLI responds with `control_response`

```json
{
  "type": "control_response",
  "response": {
    "request_id": "<uuid>",
    "subtype": "success"
  }
}
```

### 4. Claude CLI sends `system/init`

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "sess_abc123",
  "model": "claude-sonnet-4-6"
}
```

The `session_id` is the primary identity for routing. Each unique session ID maps to a separate UI tab.

## CLI flags

A typical invocation:

```sh
claude -p "task description" \
  --sdk-url ws://localhost:8765 \
  --output-format stream-json \
  --input-format stream-json \
  --verbose \
  --model claude-sonnet-4-6 \
  --dangerously-skip-permissions
```

| Flag | Purpose |
| --- | --- |
| `--sdk-url` | WebSocket URL for the relay |
| `--output-format stream-json` | Emit NDJSON to the relay |
| `--input-format stream-json` | Accept NDJSON from the relay |
| `--verbose` | Include extra detail in output |
| `--dangerously-skip-permissions` | Auto-approve all tool use |
| `-p` | Initial prompt (placeholder if relay sends messages) |

## Message types

All messages are single-line JSON terminated with `\n`.

### `system` (from Claude CLI)

Initialization and system-level messages.

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "sess_abc123",
  "model": "claude-sonnet-4-6"
}
```

The `init` subtype is the first meaningful message. It carries the `session_id` used for tab routing.

### `stream_event` (from Claude CLI)

Wraps Anthropic API streaming events.

```json
{
  "type": "stream_event",
  "event": {
    "type": "<event_type>",
    "index": 0,
    "content_block": { "type": "text", "name": "...", "id": "..." },
    "delta": { "type": "text_delta", "text": "chunk..." }
  }
}
```

**Event types within `event.type`:**

| Event | Description |
| --- | --- |
| `message_start` | New turn begins |
| `content_block_start` | New content block (text, tool_use, thinking) |
| `content_block_delta` | Streaming chunk within a block |
| `content_block_stop` | Block finished |
| `message_stop` | Turn finished |

**Delta types within `event.delta.type`:**

| Delta | Description |
| --- | --- |
| `text_delta` | Text from Claude's response (`event.delta.text`) |
| `input_json_delta` | Tool input streaming (`event.delta.partial_json`) |
| `thinking_delta` | Extended thinking output (`event.delta.thinking`) |

### `assistant` (from Claude CLI)

Complete (non-streamed) assistant message with all content blocks.

```json
{
  "type": "assistant",
  "message": {
    "content": [
      { "type": "text", "text": "Full response text" },
      { "type": "tool_use", "name": "Write", "input": { "file_path": "..." }, "id": "tu_123" },
      { "type": "tool_result", "content": "Tool output..." }
    ]
  }
}
```

### `result` (from Claude CLI)

Turn completion signal.

```json
{
  "type": "result",
  "is_error": false,
  "result": "Final text output",
  "session_id": "sess_abc123",
  "cost_usd": 0.012,
  "duration_ms": 4500
}
```

### `control_request` (from Claude CLI)

Tool use approval request.

```json
{
  "type": "control_request",
  "request_id": "<uuid>",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "Bash",
    "input": { "command": "npm test" }
  }
}
```

### `control_response` (to Claude CLI)

Approval response. Two formats exist depending on the relay:

**loop relay format:**

```json
{
  "type": "control_response",
  "response": {
    "request_id": "<uuid>",
    "subtype": "success",
    "response": {
      "behavior": "allow",
      "updatedInput": { "command": "npm test" }
    }
  }
}
```

**agents-ui relay format:**

```json
{
  "type": "control_response",
  "request_id": "<uuid>",
  "permission": { "allow": true }
}
```

### `user` (to Claude CLI)

Sends a new prompt/turn to Claude.

```json
{
  "type": "user",
  "message": { "role": "user", "content": "Fix the test failures" },
  "parent_tool_use_id": null,
  "session_id": "sess_abc123"
}
```

### `status` (from relay to frontends)

Synthetic messages from the relay indicating connection state. **Not sent by Claude CLI.**

```json
{ "type": "status", "text": "claude code connected" }
{ "type": "status", "text": "claude code is connected" }
{ "type": "status", "text": "claude code disconnected" }
```

The `"disconnected"` status is the only reliable signal that Claude Code has exited, since the relay WebSocket to the frontend stays open.

## Session rotation

The agents-ui maps sessions to UI tabs using these ref maps:

```
claudeConnectionAgentIds:    connectionId -> currentAgentId
claudeSessionAgentIds:       sessionId    -> canonicalAgentId
claudeSessionIds:            agentId      -> sessionId
claudeConnectionOwnedAgents: connectionId -> Set<agentId>
```

**Rotation algorithm** (when a message with `session_id` arrives):

1. Look up `claudeSessionAgentIds[sessionId]` -> found an existing agent?
   - If found and agent is **not disconnected**: reuse it (same tab)
   - If found but agent **is disconnected**: delete stale mapping, fall through
2. Check if current agent already owns this session ID -> reuse
3. Check if current agent has no session and no content, and is not disconnected -> reuse (fresh placeholder)
4. Otherwise -> **create a new agent** (new tab)

This means each distinct `session_id` gets its own tab. When Claude Code restarts on the same relay port with a new session, a new tab is created.

## Relay behavior

Both relays (agents-ui and loop) are **dumb pipes**. They forward raw NDJSON in both directions without transformation.

The only relay-level logic:

| Behavior | Description |
| --- | --- |
| **Auto-approve** | Intercepts `control_request` from Claude CLI and immediately responds with `control_response` (permission: allow) |
| **Status messages** | Injects synthetic `{ type: "status", text: "..." }` messages when Claude connects/disconnects |
| **Frontend passthrough** | Forwards raw messages from frontends directly to Claude — the frontend is responsible for sending messages in Claude's native format |

## Disconnect handling

### Via relay (WebSocket stays open)

When Claude Code exits, the relay detects the WS close and broadcasts `{ type: "status", text: "claude code disconnected" }`. The frontend:

1. Marks all agents owned by this connection as `"disconnected"`
2. Clears `claudeSessionAgentIds` entries (so the next session doesn't route to dead agents)
3. Does **not** trigger reconnection (the relay WS is still alive)

### Direct connection (WebSocket closes)

When the WS closes directly:

1. Marks all owned agents as `"reconnecting"`
2. Attempts reconnection with exponential backoff
3. On reconnect, calls `rotateClaudeConnectionAgent` to create a fresh agent if the old one had content

## Session freshness

The `loop` CLI restarts the Claude process after each turn (`await this.cleanup()` in `runTurnExclusive`). This ensures each task gets a fresh `session_id`, which agents-ui maps to a separate tab. Without this, all turns in the same Claude process share one session and one tab.

## Discovery

The agents-ui probes ports 8765-8774 every 5 seconds. For Claude, discovery connects with `silent: true`, meaning:

- No reconnection on disconnect (the agent is removed if it has no content)
- If the relay is alive, the frontend receives messages and creates agents as sessions appear

## Raw line parsing fallbacks

When JSON parsing fails, the agents-ui attempts regex extraction:

| Pattern | Purpose |
| --- | --- |
| `/session(?:_id\|Id)?(?:["'=\s:]+)([a-z0-9._-]{8,})/i` | Extract session ID from raw text |
| `/\[(?:init\|system\/init)\]\|\bsubtype["'=\s:]+init\b/i` | Detect init messages |

These handle edge cases where the NDJSON framing is malformed or the message format is unexpected.
