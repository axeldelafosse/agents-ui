# Codex App-Server Protocol

The Codex app-server exposes a WebSocket interface using **JSON-RPC 2.0** over newline-delimited JSON (NDJSON). A single WebSocket connection (called a "hub") can host multiple threads and turns concurrently.

## Connection model

```
Browser ──ws──> codex app-server (port 4500+)
```

The browser connects directly to the Codex app-server via WebSocket. Port probing for auto-discovery is handled by a Next.js API route:

```
GET /api/probe?ports=4500,4501,4502
Response: [4500, 4502]   (array of open ports)
```

## Schema sync workflow

This repo vendors generated Codex app-server schemas in `codex-app-server-schemas/`.
Routing and output parsing code consume those types directly, so keep them in sync
when the app-server protocol changes.

1. Regenerate/export schemas from the Codex app-server source (ts-rs output).
2. Copy them into this repo:

```bash
bun run codex-schemas:update /absolute/path/to/codex-app-server-schemas
```

3. Verify the copied schemas and run a build check:

```bash
bun run codex-schemas:verify
bun run build
```

You can also set `CODEX_APP_SERVER_SCHEMAS_SRC` instead of passing a path argument.

## Framing

All messages are newline-delimited JSON. Each line is a complete JSON-RPC 2.0 object:

```
{"jsonrpc":"2.0","method":"initialize","id":1,"params":{...}}\n
{"jsonrpc":"2.0","id":1,"result":{...}}\n
{"jsonrpc":"2.0","method":"turn/started","params":{...}}\n
```

Three message shapes exist:

| Shape | Has `id`? | Has `method`? | Description |
| --- | --- | --- | --- |
| Request | yes | yes | Client or server asking for a response |
| Response | yes | no | Answer to a request |
| Notification | no | yes | One-way event, no response expected |

## Initialization handshake

### 1. `initialize` (request, client -> server)

```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "id": 1,
  "params": {
    "clientInfo": { "name": "agents-ui", "version": "0.1.0", "title": "Agents UI" },
    "capabilities": { "experimentalApi": true }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "serverInfo": { "name": "codex", "version": "0.1.0" },
    "capabilities": {}
  }
}
```

### 2. `initialized` (notification, client -> server)

Sent immediately after the `initialize` response. The server may start emitting events after this.

```json
{ "jsonrpc": "2.0", "method": "initialized" }
```

## Thread lifecycle

A **thread** is a persistent conversation. Multiple turns (tasks) execute within a thread. The server reuses the same thread ID across turns unless a new `thread/start` is called.

### `thread/start` (request)

Creates a new thread.

```json
{
  "jsonrpc": "2.0",
  "method": "thread/start",
  "id": 2,
  "params": {
    "model": "o4-mini",
    "approvalPolicy": "never",
    "experimentalRawEvents": true,
    "persistExtendedHistory": true
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "thread": { "id": "019c90d5-...-0cdc" },
    "id": "019c90d5-...-0cdc"
  }
}
```

> **Quirk**: The thread ID appears in both `result.thread.id` and `result.id`.

### `thread/read` (request)

Fetches metadata (preview text) for an existing thread.

```json
{
  "jsonrpc": "2.0",
  "method": "thread/read",
  "id": 3,
  "params": { "threadId": "019c90d5-...-0cdc", "includeTurns": false }
}
```

### `thread/loaded/list` (request)

Lists all currently loaded thread IDs. Not supported by all server versions.

```json
{
  "jsonrpc": "2.0",
  "method": "thread/loaded/list",
  "id": 4,
  "params": {}
}
```

Response: `{ "result": { "data": ["thread-1", "thread-2"] } }`

### `addConversationListener` (request)

Subscribe to events for a specific thread. Not supported by all server versions.

```json
{
  "jsonrpc": "2.0",
  "method": "addConversationListener",
  "id": 5,
  "params": { "conversationId": "019c90d5-...-0cdc", "experimentalRawEvents": true }
}
```

## Turn lifecycle

A **turn** is a single prompt -> completion cycle within a thread.

### `turn/start` (request)

```json
{
  "jsonrpc": "2.0",
  "method": "turn/start",
  "id": 6,
  "params": {
    "threadId": "019c90d5-...-0cdc",
    "input": [{ "type": "text", "text": "Fix the bug in auth.ts", "text_elements": [] }],
    "model": "o4-mini",
    "effort": null,
    "cwd": null
  }
}
```

Response: `{ "result": { "id": "turn-uuid-456", "turn": { "id": "turn-uuid-456" } } }`

> **Quirk**: Like `thread/start`, the turn ID appears in both places.

## Event notifications (server -> client)

After a turn starts, the server streams notifications. All have `method` and `params` but no `id`.

### Streaming text

The primary text streaming event:

```json
{
  "jsonrpc": "2.0",
  "method": "item/agentMessage/delta",
  "params": {
    "turnId": "turn-uuid-456",
    "threadId": "019c90d5-...-0cdc",
    "text": "chunk of text..."
  }
}
```

The server also emits alternative naming variants for the same logical event:

| Method | Description |
| --- | --- |
| `item/agentMessage/delta` | Primary text delta |
| `codex/event/agent_message_delta` | Alternative naming |
| `codex/event/agent_message_content_delta` | Content-wrapped variant |
| `codex/event/agent_message` | Complete message (non-streaming) |
| `codex/event/raw_response_item` | Raw response item |

### Turn progress

| Method | Direction | Description |
| --- | --- | --- |
| `turn/started` | server -> client | Turn has begun executing |
| `item/completed` | server -> client | A message item finished |
| `turn/completed` | server -> client | Turn finished (has `status`: `"success"` or `"failed"`) |
| `thread/started` | server -> client | Thread was created |

### Task/thread completion

| Method | Description |
| --- | --- |
| `codex/event/task_complete` | **Undocumented but real.** Sent by real servers after a task finishes. Not in the official OpenAI docs. |
| `thread/archived` | Documented. Thread is done and archived. |

Both carry `{ threadId, turnId }` in params. The agents-ui uses these to mark the agent tab as disconnected and clear stale routing.

### Sub-agent / command execution events

When an agent spawns sub-agents, each sub-agent operates on its own thread. The agents-ui routes sub-agent events to the parent agent's tab. These events are **undocumented** but sent by real Codex servers:

| Method | Alternative | Description |
| --- | --- | --- |
| `codex/event/exec_command_begin` | — | Sub-agent started a command. Params include `command`. |
| `item/commandExecution/outputDelta` | `codex/event/exec_command_output_delta` | Streaming terminal output from a command execution. |
| `codex/event/exec_command_end` | — | Command execution finished. |
| `item/reasoning/summaryTextDelta` | `codex/event/agent_reasoning_delta`, `codex/event/reasoning_content_delta` | Agent reasoning text (internal thinking). |
| `item/reasoning/summaryPartAdded` | `codex/event/agent_reasoning_section_break` | Reasoning section boundary. |
| `item/started` | `codex/event/item_started` | A new item began processing. |
| `codex/event/collab_waiting_begin` | — | Agent is waiting for collaboration input. |

Command execution output is displayed in the parent agent's output. Reasoning events are acknowledged but not displayed.

### Metadata events

| Method | Description |
| --- | --- |
| `thread/name/updated` | Thread was renamed. Params: `{ threadName }` |
| `thread/tokenUsage/updated` | Token count update |
| `account/rateLimits/updated` | Rate limit info |
| `codex/event/token_count` | Token count (alternative) |

### Error notification

```json
{
  "jsonrpc": "2.0",
  "method": "error",
  "params": {
    "turnId": "...",
    "threadId": "...",
    "error": { "message": "Something went wrong" }
  }
}
```

Errors can also arrive embedded in `turn/completed` with `status: "failed"`.

## Approval requests (server -> client)

The server sends JSON-RPC **requests** (with `id`) when it needs permission. The client responds with a standard JSON-RPC response.

### Command approval

```json
{
  "jsonrpc": "2.0",
  "method": "item/commandExecution/requestApproval",
  "id": 100,
  "params": { "command": "npm install", "context": "..." }
}
```

Accept: `{ "id": 100, "result": { "decision": "accept" } }`

### File change approval

```json
{
  "jsonrpc": "2.0",
  "method": "item/fileChange/requestApproval",
  "id": 101,
  "params": { "operation": "write", "path": "/src/index.ts" }
}
```

### Tool user input

```json
{
  "jsonrpc": "2.0",
  "method": "item/tool/requestUserInput",
  "id": 102,
  "params": { "tool": "browser", "question": "..." }
}
```

Response: `{ "id": 102, "result": { "answers": {} } }`

### Unsupported requests

`item/tool/call`, `applyPatchApproval`, `execCommandApproval`, and `account/chatgptAuthTokens/refresh` are server requests that clients typically reject with error code `-32601`.

## Thread reuse behavior

The Codex app-server treats threads as persistent conversations. After `task_complete`, the server can start a **new turn** on the **same thread**. This is the "collab" pattern:

```
thread/start       -> thread 019c90d5
turn/start         -> turn A on thread 019c90d5
item/agentMessage  -> streaming...
turn/completed     -> turn A done
task_complete      -> thread 019c90d5 task done
...
turn/started       -> turn B on SAME thread 019c90d5 (new task!)
```

The thread ID only changes if the client explicitly calls `thread/start` again.

### Implications for UI routing

Because thread IDs persist across tasks, the UI must decide whether a new turn on the same thread is a "continuation" (same tab) or a "new task" (new tab). The `loop` CLI solves this by calling `thread/start` for each turn, producing distinct thread IDs that naturally map to separate tabs.

## Timeouts and reconnection

| Constant | Value | Description |
| --- | --- | --- |
| Request timeout | 600 s | Max wait for any RPC response |
| WS connect attempts | 40 | Retries when initially connecting |
| WS connect delay | 150 ms | Delay between connection retries |

On disconnect, the agents-ui:

1. Clears stale `threadId -> agentId` mappings
2. Marks all hub agents as disconnected
3. Attempts reconnection with exponential backoff
4. On reconnect, re-sends `initialize` and discovers threads via `thread/loaded/list`

## Discovery

The agents-ui probes ports 4500-4509 every 5 seconds using the `/api/probe` endpoint. Open ports get a "silent" hub (no thread spawned, `reconnectEnabled: false`). Once the hub receives thread data via notifications, the UI attaches discovered threads to new agent tabs.
