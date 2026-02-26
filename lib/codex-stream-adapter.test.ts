import { describe, expect, test } from "bun:test"

import {
  adaptCodexMessageToStreamItems,
  adaptCodexStreamMessage,
  createCodexStreamAdapterState,
} from "@/lib/codex-stream-adapter"
import type { StreamItemAction } from "@/lib/stream-items"

function expectCreate(
  action: StreamItemAction | undefined
): Extract<StreamItemAction, { type: "create" }> {
  if (!action || action.type !== "create") {
    throw new Error("Expected create action")
  }
  return action
}

function expectAppend(
  action: StreamItemAction | undefined
): Extract<StreamItemAction, { type: "append_text" }> {
  if (!action || action.type !== "append_text") {
    throw new Error("Expected append_text action")
  }
  return action
}

function expectComplete(
  action: StreamItemAction | undefined
): Extract<StreamItemAction, { type: "complete" }> {
  if (!action || action.type !== "complete") {
    throw new Error("Expected complete action")
  }
  return action
}

function referencedActionIds(actions: StreamItemAction[]): string[] {
  const ids: string[] = []
  for (const action of actions) {
    if (action.type === "create" || action.type === "upsert") {
      ids.push(action.item.id)
      continue
    }
    ids.push(action.id)
  }
  return ids
}

describe("codex stream adapter", () => {
  test("maps item/started and plan/reasoning deltas", () => {
    const state = createCodexStreamAdapterState()

    const startedPlan = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-a",
        turnId: "turn-a",
        item: {
          id: "plan-1",
          type: "plan",
          text: "Initial plan",
        },
      },
    })

    const planCreated = expectCreate(startedPlan[0])
    expect(planCreated.item).toMatchObject({
      type: "plan",
      itemId: "plan-1",
      threadId: "thread-a",
      turnId: "turn-a",
      data: {
        title: "plan",
        text: "Initial plan",
      },
    })

    const planDelta = adaptCodexMessageToStreamItems(state, {
      method: "item/plan/delta",
      params: {
        threadId: "thread-a",
        turnId: "turn-a",
        itemId: "plan-1",
        delta: "\n- Step 2",
      },
    })
    expect(planDelta).toEqual([
      { type: "append_text", id: planCreated.item.id, text: "\n- Step 2" },
    ])

    const reasoningDelta = adaptCodexMessageToStreamItems(state, {
      method: "item/reasoning/summaryTextDelta",
      params: {
        threadId: "thread-a",
        turnId: "turn-a",
        itemId: "reason-1",
        delta: "Need to inspect runtime flow.",
      },
    })

    expect(reasoningDelta).toHaveLength(2)
    const reasoningCreated = expectCreate(reasoningDelta[0])
    expect(reasoningCreated.item).toMatchObject({
      type: "reasoning",
      itemId: "reason-1",
      threadId: "thread-a",
      turnId: "turn-a",
    })
    const reasoningAppended = expectAppend(reasoningDelta[1])
    expect(reasoningAppended.id).toBe(reasoningCreated.item.id)
    expect(reasoningAppended.text).toBe("Need to inspect runtime flow.")
  })

  test("maps terminal interaction, file delta, and mcp progress events", () => {
    const state = createCodexStreamAdapterState()

    const commandStart = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-b",
        turnId: "turn-b",
        item: {
          id: "cmd-1",
          type: "commandExecution",
          command: "bun test",
        },
      },
    })
    const commandCreated = expectCreate(commandStart[0])
    expect(commandCreated.item.type).toBe("command_execution")

    const terminalInteraction = adaptCodexMessageToStreamItems(state, {
      method: "item/commandExecution/terminalInteraction",
      params: {
        threadId: "thread-b",
        turnId: "turn-b",
        itemId: "cmd-1",
        text: "Process is waiting for input.",
      },
    })
    expect(terminalInteraction.length).toBeGreaterThan(0)
    expect(referencedActionIds(terminalInteraction)).toContain(
      commandCreated.item.id
    )

    const legacyTerminalInteraction = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/terminal_interaction",
      params: {
        threadId: "thread-b",
        turnId: "turn-b",
        call_id: "cmd-1",
        process_id: "4242",
        stdin: "y",
      },
    })
    expect(legacyTerminalInteraction.length).toBeGreaterThan(0)
    expect(referencedActionIds(legacyTerminalInteraction)).toContain(
      commandCreated.item.id
    )
    const legacyTerminalUpdate = legacyTerminalInteraction.find(
      (action) => action.type === "update"
    )
    expect(legacyTerminalUpdate?.type).toBe("update")
    if (!legacyTerminalUpdate || legacyTerminalUpdate.type !== "update") {
      throw new Error("Expected update action for legacy terminal interaction")
    }
    expect(legacyTerminalUpdate.patch).toMatchObject({
      data: {
        processId: "4242",
        stdin: "y",
      },
    })

    const fileStart = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-b",
        turnId: "turn-b",
        item: {
          id: "file-1",
          type: "fileChange",
        },
      },
    })
    const fileCreated = expectCreate(fileStart[0])
    expect(fileCreated.item.type).toBe("file_change")

    const fileDelta = adaptCodexMessageToStreamItems(state, {
      method: "item/fileChange/outputDelta",
      params: {
        threadId: "thread-b",
        turnId: "turn-b",
        itemId: "file-1",
        delta: "@@ -1 +1 @@\n-old\n+new",
      },
    })
    expect(fileDelta.length).toBeGreaterThan(0)
    expect(referencedActionIds(fileDelta)).toContain(fileCreated.item.id)

    const mcpStart = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-b",
        turnId: "turn-b",
        item: {
          id: "mcp-1",
          type: "mcpToolCall",
        },
      },
    })
    const mcpCreated = expectCreate(mcpStart[0])
    expect(mcpCreated.item.type).toBe("mcp_tool_call")

    const mcpProgress = adaptCodexMessageToStreamItems(state, {
      method: "item/mcpToolCall/progress",
      params: {
        threadId: "thread-b",
        turnId: "turn-b",
        itemId: "mcp-1",
        text: "50%",
      },
    })
    expect(mcpProgress.length).toBeGreaterThan(0)
    expect(referencedActionIds(mcpProgress)).toContain(mcpCreated.item.id)
  })

  test("adds approval request metadata for requestUserInput", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      id: 102,
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-c",
        turnId: "turn-c",
        questions: [
          { question: "Which workspace should I use?" },
          { header: "Need confirmation" },
        ],
      },
    })

    const created = expectCreate(actions[0])
    expect(created.item).toMatchObject({
      type: "approval_request",
      status: "complete",
      threadId: "thread-c",
      turnId: "turn-c",
      data: {
        title: "User input request",
        text: "Which workspace should I use?\nNeed confirmation",
        requestId: 102,
        requestMethod: "item/tool/requestUserInput",
      },
    })
    expect(created.item.data.params).toMatchObject({
      questions: [
        { question: "Which workspace should I use?" },
        { header: "Need confirmation" },
      ],
    })
  })

  test("falls back to raw_item for unknown events", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      method: "item/unknown/customEvent",
      params: {
        threadId: "thread-d",
        turnId: "turn-d",
        payload: { foo: "bar" },
      },
    })

    const created = expectCreate(actions[0])
    expect(created.item).toMatchObject({
      type: "raw_item",
      status: "complete",
      threadId: "thread-d",
      turnId: "turn-d",
    })
    const rawPayload = JSON.stringify(created.item.data)
    expect(rawPayload).toContain("customEvent")
    expect(rawPayload).toContain("foo")
  })

  test("falls back to raw_item for metadata-only raw_response_item events", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      id: 77,
      method: "codex/event/raw_response_item",
      params: {
        threadId: "thread-raw",
        turnId: "turn-raw",
        msg: {
          usage: { input: 120, output: 10 },
        },
      },
    })

    const created = expectCreate(actions[0])
    expect(created.item).toMatchObject({
      type: "raw_item",
      status: "complete",
      threadId: "thread-raw",
      turnId: "turn-raw",
      data: {
        method: "codex/event/raw_response_item",
        requestId: 77,
      },
    })
    const rawPayload = JSON.stringify(created.item.data)
    expect(rawPayload).toContain("usage")
  })

  test("applies completed item payload to mapped stream item", () => {
    const state = createCodexStreamAdapterState()

    const started = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-e",
        turnId: "turn-e",
        item: {
          id: "cmd-complete-1",
          type: "commandExecution",
          command: "bun test",
        },
      },
    })
    const startedCommand = expectCreate(started[0])

    const completed = adaptCodexMessageToStreamItems(state, {
      method: "item/completed",
      params: {
        threadId: "thread-e",
        turnId: "turn-e",
        itemId: "cmd-complete-1",
        item: {
          id: "cmd-complete-1",
          type: "commandExecution",
          status: "completed",
          exitCode: 0,
          aggregatedOutput: "ok",
        },
      },
    })

    const completion = expectComplete(completed[0])
    expect(completion.id).toBe(startedCommand.item.id)
    expect(completion.status).toBe("complete")
    expect(completion.patch).toMatchObject({
      data: {
        exitCode: 0,
        output: "ok",
        status: "completed",
      },
    })
  })

  test("does not complete active message when another item completes", () => {
    const state = createCodexStreamAdapterState()

    const messageDelta = adaptCodexMessageToStreamItems(state, {
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-f",
        turnId: "turn-f",
        text: "streaming",
      },
    })
    const messageCreate = expectCreate(messageDelta[0])

    adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-f",
        turnId: "turn-f",
        item: {
          id: "cmd-thread-f",
          type: "commandExecution",
          command: "echo hi",
        },
      },
    })

    const completion = adaptCodexMessageToStreamItems(state, {
      method: "item/completed",
      params: {
        threadId: "thread-f",
        turnId: "turn-f",
        itemId: "cmd-thread-f",
      },
    })

    const completedIds = completion
      .filter((action) => action.type === "complete")
      .map((action) => action.id)
    expect(completedIds).not.toContain(messageCreate.item.id)
  })

  test("creates raw item for rawResponseItem/completed without active stream", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      method: "rawResponseItem/completed",
      params: {
        threadId: "thread-g",
        turnId: "turn-g",
      },
    })

    const created = expectCreate(actions[0])
    expect(created.item).toMatchObject({
      type: "raw_item",
      status: "complete",
      threadId: "thread-g",
      turnId: "turn-g",
    })
  })

  test("includes agentId on created items when called with agentId", () => {
    const actions = adaptCodexStreamMessage(
      {
        method: "item/started",
        params: {
          threadId: "thread-agent",
          turnId: "turn-agent",
          item: {
            id: "msg-agent-1",
            type: "agentMessage",
            text: "hello",
          },
        },
      },
      "agent-test-codex"
    )

    const created = expectCreate(actions[0])
    expect(created.item.agentId).toBe("agent-test-codex")
  })

  describe("lifecycle events produce no stream items", () => {
    const lifecycleMethods = [
      "turn/started",
      "thread/started",
      "codex/event/collab_agent_spawn_begin",
      "codex/event/collab_agent_spawn_end",
      "codex/event/mcp_startup_update",
      "codex/event/mcp_startup_complete",
      "codex/event/shutdown_complete",
    ]

    for (const method of lifecycleMethods) {
      test(`${method} returns empty actions`, () => {
        const state = createCodexStreamAdapterState()
        const actions = adaptCodexMessageToStreamItems(state, {
          method,
          params: { threadId: "thread-1", turnId: "turn-1" },
        })
        expect(actions).toEqual([])
      })
    }
  })

  test("messages from different turns do not merge (finding 1 regression)", () => {
    const state = createCodexStreamAdapterState()

    // Turn 1 message
    const turn1 = adaptCodexMessageToStreamItems(state, {
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        delta: "Hello from turn 1",
      },
    })
    expect(turn1).toHaveLength(2)
    const msg1 = expectCreate(turn1[0])
    expect(msg1.item.type).toBe("message")
    const append1 = expectAppend(turn1[1])
    expect(append1.id).toBe(msg1.item.id)

    // Turn 2 message on same thread, different turn
    const turn2 = adaptCodexMessageToStreamItems(state, {
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-1",
        turnId: "turn-2",
        delta: "Hello from turn 2",
      },
    })
    expect(turn2).toHaveLength(2)
    const msg2 = expectCreate(turn2[0])
    expect(msg2.item.type).toBe("message")
    expect(msg2.item.id).not.toBe(msg1.item.id)
    const append2 = expectAppend(turn2[1])
    expect(append2.id).toBe(msg2.item.id)
  })

  test("exec_command_end creates fallback item when begin was missed (finding 2 regression)", () => {
    const state = createCodexStreamAdapterState()

    // Send exec_command_end without a matching exec_command_begin
    const actions = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/exec_command_end",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        status: "completed",
        exit_code: 0,
        call_id: "orphan-cmd",
      },
    })

    // Should NOT return empty — should create a fallback command item
    expect(actions.length).toBeGreaterThanOrEqual(2) // create + complete at minimum
    const created = expectCreate(actions[0])
    expect(created.item.type).toBe("command_execution")
    const completed = expectComplete(actions.at(-1))
    expect(completed.id).toBe(created.item.id)
  })
})
