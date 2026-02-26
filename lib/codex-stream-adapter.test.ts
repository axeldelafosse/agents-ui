import { describe, expect, test } from "bun:test"

import {
  adaptCodexMessageToStreamItems,
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

function expectUpdate(
  action: StreamItemAction | undefined
): Extract<StreamItemAction, { type: "update" }> {
  if (!action || action.type !== "update") {
    throw new Error("Expected update action")
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

  test("does not create placeholder command item when legacy begin has no command", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/exec_command_begin",
      params: {
        threadId: "thread-cmd",
        turnId: "turn-cmd",
        call_id: "cmd-missing",
      },
    })

    expect(actions).toEqual([])
  })

  test("maps userMessage thread items to user-role message items", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-user-started",
        turnId: "turn-user-started",
        item: {
          id: "user-msg-1",
          type: "userMessage",
          content: [{ type: "text", text: "Please summarize this diff" }],
        },
      },
    })

    const created = expectCreate(actions[0])
    expect(created.item).toMatchObject({
      type: "message",
      itemId: "user-msg-1",
      data: {
        role: "user",
        text: "Please summarize this diff",
      },
    })
  })

  test("maps legacy UserMessage thread items to user-role message items", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-user-started-legacy",
        turnId: "turn-user-started-legacy",
        item: {
          id: "user-msg-legacy-1",
          type: "UserMessage",
          content: [{ type: "text", text: "Legacy user prompt text" }],
        },
      },
    })

    const created = expectCreate(actions[0])
    expect(created.item).toMatchObject({
      type: "message",
      itemId: "user-msg-legacy-1",
      data: {
        role: "user",
        text: "Legacy user prompt text",
      },
    })
  })

  test("maps codex/event/user_message to user-role message stream", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/user_message",
      params: {
        threadId: "thread-user-event",
        turnId: "turn-user-event",
        msg: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Run the build check next" }],
        },
      },
    })

    expect(actions).toHaveLength(3)
    const created = expectCreate(actions[0])
    expect(created.item).toMatchObject({
      type: "message",
      data: {
        role: "user",
      },
    })
    const appended = expectAppend(actions[1])
    expect(appended.text).toBe("Run the build check next")
    expectComplete(actions[2])
  })

  test("dedupes item/started userMessage after equivalent user_message event", () => {
    const state = createCodexStreamAdapterState()
    const fromUserEvent = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/user_message",
      params: {
        threadId: "thread-user-dedupe",
        turnId: "turn-user-dedupe",
        msg: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Plan mode: Task: review Create or update PLAN.md",
            },
          ],
        },
      },
    })
    const firstCreated = expectCreate(fromUserEvent[0])

    const startedDuplicate = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-user-dedupe",
        turnId: "turn-user-dedupe",
        item: {
          id: "user-msg-dedupe",
          type: "UserMessage",
          content: [
            {
              type: "text",
              text: "Plan mode:\nTask: review\nCreate or update PLAN.md",
            },
          ],
        },
      },
    })
    expect(startedDuplicate).toEqual([])

    const completed = adaptCodexMessageToStreamItems(state, {
      method: "item/completed",
      params: {
        threadId: "thread-user-dedupe",
        turnId: "turn-user-dedupe",
        itemId: "user-msg-dedupe",
      },
    })
    const completion = expectComplete(completed[0])
    expect(completion.id).toBe(firstCreated.item.id)
  })

  test("dedupes item/started userMessage when user_message omits turnId", () => {
    const state = createCodexStreamAdapterState()
    const fromUserEvent = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/user_message",
      params: {
        threadId: "thread-user-dedupe-mismatch",
        msg: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Write three programs: hello world, hello axel, and hello!",
            },
          ],
        },
      },
    })
    const firstCreated = expectCreate(fromUserEvent[0])

    const startedDuplicate = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-user-dedupe-mismatch",
        turnId: "turn-user-dedupe-mismatch",
        item: {
          id: "user-msg-dedupe-mismatch",
          type: "UserMessage",
          content: [
            {
              type: "text",
              text: "Write three programs: hello world, hello axel, and hello!",
            },
          ],
        },
      },
    })
    expect(startedDuplicate).toEqual([])

    const completed = adaptCodexMessageToStreamItems(state, {
      method: "item/completed",
      params: {
        threadId: "thread-user-dedupe-mismatch",
        turnId: "turn-user-dedupe-mismatch",
        itemId: "user-msg-dedupe-mismatch",
      },
    })
    const completion = expectComplete(completed[0])
    expect(completion.id).toBe(firstCreated.item.id)
  })

  test("dedupes user_message when item/started arrives first with turnId", () => {
    const state = createCodexStreamAdapterState()
    const started = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-user-dedupe-reverse",
        turnId: "turn-user-dedupe-reverse",
        item: {
          id: "user-msg-dedupe-reverse",
          type: "UserMessage",
          content: [
            {
              type: "text",
              text: 'Write three programs: one that say hello world, another one that says hello axel and the other one that says hello!\n\nProof requirements:\nshould say hello\n\nSpawn a team of agents with worktree isolation. When all work is verified and once you have a proof that the task is completed, append "<promise>DONE</promise>" on its own final line.',
            },
          ],
        },
      },
    })
    const startedCreate = expectCreate(started[0])

    const fromUserEvent = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/user_message",
      params: {
        msg: {
          type: "message",
          role: "user",
          text: 'Write three programs: one that say hello world, another one that says hello axel and the other one that says hello! Proof requirements: should say hello Spawn a team of agents with worktree isolation. When all work is verified and once you have a proof that the task is completed, append "<promise>DONE</promise>" on its own final line.',
        },
      },
    })
    expect(fromUserEvent).toHaveLength(1)
    const completion = expectComplete(fromUserEvent[0])
    expect(completion.id).toBe(startedCreate.item.id)
  })

  test("dedupes threadless user_message after item/completed closed started prompt", () => {
    const state = createCodexStreamAdapterState()
    const started = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-user-post-complete",
        turnId: "turn-user-post-complete",
        item: {
          id: "user-msg-post-complete",
          type: "UserMessage",
          content: [
            {
              type: "text",
              text: "Verify hello_world.py contains the expected output text 'hello world'.",
            },
          ],
        },
      },
    })
    const startedCreate = expectCreate(started[0])

    const completed = adaptCodexMessageToStreamItems(state, {
      method: "item/completed",
      params: {
        threadId: "thread-user-post-complete",
        turnId: "turn-user-post-complete",
        itemId: "user-msg-post-complete",
      },
    })
    const completion = expectComplete(completed[0])
    expect(completion.id).toBe(startedCreate.item.id)

    const fromUserEvent = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/user_message",
      params: {
        msg: {
          role: "user",
          text: "Verify hello_world.py contains the expected output text 'hello world'.",
        },
      },
    })
    expect(fromUserEvent).toEqual([])
  })

  test("uses injected clock for duplicate completion window", () => {
    const state = createCodexStreamAdapterState()
    let nowMs = 1000
    const options = { now: () => nowMs }
    const input = {
      method: "codex/event/user_message",
      params: {
        threadId: "thread-clock",
        turnId: "turn-clock",
        msg: {
          role: "user",
          text: "run deterministic dedupe check",
        },
      },
    } as const

    const first = adaptCodexMessageToStreamItems(state, input, options)
    expect(first).toHaveLength(3)

    const immediateDuplicate = adaptCodexMessageToStreamItems(
      state,
      input,
      options
    )
    expect(immediateDuplicate).toEqual([])

    nowMs += 10_000
    const delayedDuplicate = adaptCodexMessageToStreamItems(
      state,
      input,
      options
    )
    expect(delayedDuplicate).toHaveLength(3)
  })

  test("dedupes repeated reasoning content across v2 and legacy variants", () => {
    const state = createCodexStreamAdapterState()

    const first = adaptCodexMessageToStreamItems(state, {
      method: "item/reasoning/textDelta",
      params: {
        threadId: "thread-reasoning-dedupe",
        turnId: "turn-reasoning-dedupe",
        itemId: "reasoning-1",
        delta: "I am checking the repository state.",
      },
    })
    expect(first).toHaveLength(2)
    const created = expectCreate(first[0])
    const appended = expectAppend(first[1])
    expect(created.item.type).toBe("reasoning")
    expect(appended.text).toBe("I am checking the repository state.")

    const followUp = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/agent_reasoning",
      params: {
        threadId: "thread-reasoning-dedupe",
        turnId: "turn-reasoning-dedupe",
        itemId: "reasoning-1",
        text: "I am checking the repository state.",
      },
    })
    expect(followUp).toEqual([])
  })

  test("merges fallback command stream into later item/started commandExecution", () => {
    const state = createCodexStreamAdapterState()

    const outputDelta = adaptCodexMessageToStreamItems(state, {
      method: "item/commandExecution/outputDelta",
      params: {
        threadId: "thread-merge",
        turnId: "turn-merge",
        delta: "line-one\n",
      },
    })
    const fallbackCreated = expectCreate(outputDelta[0])
    expect(fallbackCreated.item.type).toBe("command_execution")

    const started = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-merge",
        turnId: "turn-merge",
        item: {
          id: "cmd-real",
          type: "commandExecution",
          command: "/bin/zsh -lc 'rg --files'",
        },
      },
    })
    expect(started).toHaveLength(1)
    const update = expectUpdate(started[0])
    expect(update.id).toBe(fallbackCreated.item.id)
    expect(update.patch.data).toMatchObject({
      command: "/bin/zsh -lc 'rg --files'",
    })

    const completed = adaptCodexMessageToStreamItems(state, {
      method: "item/completed",
      params: {
        threadId: "thread-merge",
        turnId: "turn-merge",
        itemId: "cmd-real",
        item: {
          id: "cmd-real",
          type: "commandExecution",
          status: "completed",
          exitCode: 0,
        },
      },
    })
    const completion = expectComplete(completed[0])
    expect(completion.id).toBe(fallbackCreated.item.id)
  })

  test("merges call_id command output stream into later item/started commandExecution", () => {
    const state = createCodexStreamAdapterState()

    const outputDelta = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/exec_command_output_delta",
      params: {
        threadId: "thread-call-id",
        turnId: "turn-call-id",
        call_id: "process-777",
        delta: "line-one\n",
      },
    })
    const provisional = expectCreate(outputDelta[0])
    expect(provisional.item.type).toBe("command_execution")
    expect(provisional.item.itemId).toBe("process-777")

    const started = adaptCodexMessageToStreamItems(state, {
      method: "item/started",
      params: {
        threadId: "thread-call-id",
        turnId: "turn-call-id",
        item: {
          id: "cmd-real",
          type: "commandExecution",
          command: "/bin/zsh -lc 'ls -la'",
        },
      },
    })
    expect(started).toHaveLength(1)
    const update = expectUpdate(started[0])
    expect(update.id).toBe(provisional.item.id)
    expect(update.patch).toMatchObject({
      itemId: "cmd-real",
      data: {
        command: "/bin/zsh -lc 'ls -la'",
      },
    })
  })

  test("exec_command_begin updates existing command stream for the same source id", () => {
    const state = createCodexStreamAdapterState()

    const rawCommand = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/raw_response_item",
      params: {
        threadId: "thread-begin-merge",
        turnId: "turn-begin-merge",
        msg: {
          type: "raw_response_item",
          item: {
            type: "function_call",
            name: "exec_command",
            arguments: '{"cmd":"rg --files"}',
            call_id: "call-begin-1",
          },
        },
      },
    })
    const created = expectCreate(rawCommand[0])

    const begin = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/exec_command_begin",
      params: {
        threadId: "thread-begin-merge",
        turnId: "turn-begin-merge",
        call_id: "call-begin-1",
        command: "/bin/zsh -lc 'rg --files'",
      },
    })
    expect(begin).toHaveLength(1)
    const update = expectUpdate(begin[0])
    expect(update.id).toBe(created.item.id)
    expect(update.patch).toMatchObject({
      data: {
        command: "/bin/zsh -lc 'rg --files'",
      },
    })
  })

  test("exec_command_begin without source id updates latest command stream in the turn", () => {
    const state = createCodexStreamAdapterState()

    const rawCommand = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/raw_response_item",
      params: {
        threadId: "thread-begin-fallback",
        turnId: "turn-begin-fallback",
        msg: {
          type: "raw_response_item",
          item: {
            type: "function_call",
            name: "exec_command",
            arguments: '{"cmd":"rg --files"}',
            call_id: "call-fallback-1",
          },
        },
      },
    })
    const created = expectCreate(rawCommand[0])

    const begin = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/exec_command_begin",
      params: {
        threadId: "thread-begin-fallback",
        turnId: "turn-begin-fallback",
        command: "/bin/zsh -lc 'rg --files'",
      },
    })
    expect(begin).toHaveLength(1)
    const update = expectUpdate(begin[0])
    expect(update.id).toBe(created.item.id)
    expect(update.patch).toMatchObject({
      data: {
        command: "/bin/zsh -lc 'rg --files'",
      },
    })
  })

  test("ignores raw_response_item text payloads that are not exec_command calls", () => {
    const state = createCodexStreamAdapterState()

    const rawResponse = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/raw_response_item",
      params: {
        threadId: "thread-msg",
        turnId: "turn-msg",
        text: "I will inspect the repo.",
      },
    })
    expect(rawResponse).toEqual([])
  })

  test("prefers v2 message stream over legacy message deltas for same thread", () => {
    const state = createCodexStreamAdapterState()

    const first = adaptCodexMessageToStreamItems(state, {
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-v2-preferred",
        turnId: "turn-v2-preferred",
        delta: "Primary v2 delta",
      },
    })
    expect(first).toHaveLength(2)

    const legacyDuplicate = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/agent_message_delta",
      params: {
        threadId: "thread-v2-preferred",
        turnId: "turn-v2-preferred",
        delta: "Primary v2 delta",
      },
    })
    expect(legacyDuplicate).toEqual([])
  })

  test("maps raw_response_item function_call exec_command into command_execution stream", () => {
    const state = createCodexStreamAdapterState()

    const rawCommand = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/raw_response_item",
      params: {
        threadId: "thread-raw-cmd",
        turnId: "turn-raw-cmd",
        msg: {
          type: "raw_response_item",
          item: {
            type: "function_call",
            name: "exec_command",
            arguments:
              '{"cmd":"ls -la","workdir":"/Users/axel/Documents/Code/loop"}',
            call_id: "call-raw-1",
          },
        },
      },
    })
    const created = expectCreate(rawCommand[0])
    expect(created.item).toMatchObject({
      type: "command_execution",
      itemId: "call-raw-1",
      threadId: "thread-raw-cmd",
      turnId: "turn-raw-cmd",
      data: {
        callId: "call-raw-1",
        command: "ls -la",
        cwd: "/Users/axel/Documents/Code/loop",
      },
    })

    const output = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/exec_command_output_delta",
      params: {
        threadId: "thread-raw-cmd",
        turnId: "turn-raw-cmd",
        call_id: "call-raw-1",
        delta: "file-a\n",
      },
    })
    const outputTargetIds = referencedActionIds(output)
    expect(outputTargetIds).toContain(created.item.id)

    const completed = adaptCodexMessageToStreamItems(state, {
      method: "codex/event/exec_command_end",
      params: {
        threadId: "thread-raw-cmd",
        turnId: "turn-raw-cmd",
        call_id: "call-raw-1",
        exitCode: 0,
        status: "completed",
      },
    })
    const done = expectComplete(completed.at(-1))
    expect(done.id).toBe(created.item.id)
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

  test("ignores metadata-only raw_response_item events", () => {
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

    expect(actions).toEqual([])
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

  test("ignores rawResponseItem/completed without an active stream item", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      method: "rawResponseItem/completed",
      params: {
        threadId: "thread-g",
        turnId: "turn-g",
      },
    })

    expect(actions).toEqual([])
  })

  test("includes agentId on created items when called with agentId", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
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
      agentId: "agent-test-codex",
    })

    const created = expectCreate(actions[0])
    expect(created.item.agentId).toBe("agent-test-codex")
  })

  describe("lifecycle events produce no stream items", () => {
    const lifecycleMethods = [
      "turn/started",
      "thread/started",
      "codex/event/agent_reasoning",
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
        command: "/bin/zsh -lc 'echo ok'",
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

  test("maps turn/diff/updated to turn_diff stream item", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      method: "turn/diff/updated",
      params: {
        threadId: "thread-diff",
        turnId: "turn-diff",
        diff: "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new",
      },
    })

    expect(actions).toHaveLength(1)
    const created = expectCreate(actions[0])
    expect(created.item).toMatchObject({
      type: "turn_diff",
      status: "complete",
      threadId: "thread-diff",
      turnId: "turn-diff",
      data: {
        diff: "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new",
        label: "Turn Diff",
      },
    })
  })

  test("maps turn/diff/updated with empty diff to turn_diff with empty string", () => {
    const state = createCodexStreamAdapterState()
    const actions = adaptCodexMessageToStreamItems(state, {
      method: "turn/diff/updated",
      params: {
        threadId: "thread-diff-empty",
        turnId: "turn-diff-empty",
      },
    })

    expect(actions).toHaveLength(1)
    const created = expectCreate(actions[0])
    expect(created.item.type).toBe("turn_diff")
    expect(created.item.data.diff).toBe("")
  })
})
