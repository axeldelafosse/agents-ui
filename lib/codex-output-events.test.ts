import { describe, expect, test } from "bun:test"

import { projectCodexOutputFromNotification } from "@/lib/codex-output-events"
import { createCodexOutputState, reduceCodexOutput } from "@/lib/stream-output"

describe("codex output event projection", () => {
  test("projects raw response item text and appends newline for readability", () => {
    const projected = projectCodexOutputFromNotification({
      method: "codex/event/raw_response_item",
      params: {
        msg: {
          content: [{ type: "output_text", text: "First sentence." }],
        },
      },
      threadId: "thread-a",
    })

    expect(projected.missingText).toBeUndefined()
    expect(projected.events).toEqual([
      {
        method: "item/agentMessage/delta",
        text: "First sentence.\n",
        threadId: "thread-a",
      },
    ])
  })

  test("projects user_message using raw msg parser", () => {
    const projected = projectCodexOutputFromNotification({
      method: "codex/event/user_message",
      params: {
        msg: {
          content: [{ type: "text", value: "User-event payload text" }],
        },
      },
      threadId: "thread-b",
    })

    expect(projected.events).toEqual([
      {
        method: "item/agentMessage/delta",
        text: "User-event payload text\n",
        threadId: "thread-b",
      },
    ])
  })

  test("maps completed variants to item/completed", () => {
    const completed = projectCodexOutputFromNotification({
      method: "codex/event/item_completed",
      params: {},
      threadId: "thread-c",
    })
    const rawCompleted = projectCodexOutputFromNotification({
      method: "rawResponseItem/completed",
      params: {},
      threadId: "thread-c",
    })

    expect(completed.events).toEqual([{ method: "item/completed" }])
    expect(rawCompleted.events).toEqual([{ method: "item/completed" }])
  })

  test("projects tool begin event into readable command text", () => {
    const projected = projectCodexOutputFromNotification({
      method: "codex/event/exec_command_begin",
      params: {
        command: "bun test lib/stream-output.test.ts",
      },
      threadId: "thread-tool",
    })

    expect(projected.events).toEqual([
      {
        method: "item/agentMessage/delta",
        text: "\n[tool] `$ bun test lib/stream-output.test.ts`\n",
        threadId: "thread-tool",
      },
    ])
  })

  test("projects tool output delta and reports missing text metadata", () => {
    const projected = projectCodexOutputFromNotification({
      method: "codex/event/exec_command_output_delta",
      params: {
        delta: "8 pass",
      },
      threadId: "thread-tool",
    })
    const missingText = projectCodexOutputFromNotification({
      method: "item/commandExecution/outputDelta",
      params: {
        id: "cmd-1",
      },
      threadId: "thread-tool",
    })

    expect(projected.events).toEqual([
      {
        method: "item/agentMessage/delta",
        text: "8 pass\n",
        threadId: "thread-tool",
      },
    ])
    expect(projected.missingText).toBeUndefined()
    expect(missingText.events).toEqual([
      {
        method: "item/agentMessage/delta",
        text: "",
        threadId: "thread-tool",
      },
    ])
    expect(missingText.missingText).toEqual({
      keys: "id",
      method: "item/commandExecution/outputDelta",
      msgKeys: "-",
      msgType: "undefined",
    })
  })

  test("projects tool end event with status and exit code", () => {
    const projected = projectCodexOutputFromNotification({
      method: "codex/event/exec_command_end",
      params: {
        status: "completed",
        exitCode: 0,
      },
      threadId: "thread-tool",
    })

    expect(projected.events).toEqual([
      {
        method: "item/agentMessage/delta",
        text: "[tool] done completed (exit 0)\n",
        threadId: "thread-tool",
      },
    ])
  })

  test("reports missing text details for metadata-only raw payloads", () => {
    const projected = projectCodexOutputFromNotification({
      method: "codex/event/raw_response_item",
      params: {
        msg: {
          id: "abc",
          conversationId: "thread-1",
          status: "completed",
        },
      },
      threadId: "thread-1",
    })

    expect(projected.events).toEqual([
      {
        method: "item/agentMessage/delta",
        text: "",
        threadId: "thread-1",
      },
    ])
    expect(projected.missingText).toEqual({
      keys: "msg",
      method: "codex/event/raw_response_item",
      msgKeys: "id,conversationId,status",
      msgType: "object",
    })
  })
})

describe("codex output projection integration sequence", () => {
  test("preserves first sentence and inserts readable boundaries", () => {
    const sequence = [
      projectCodexOutputFromNotification({
        method: "codex/event/raw_response_item",
        params: {
          msg: {
            content: [{ type: "output_text", text: "First sentence." }],
          },
        },
        threadId: "thread-seq",
      }),
      projectCodexOutputFromNotification({
        method: "codex/event/user_message",
        params: {
          msg: {
            content: [{ type: "output_text", text: "Second sentence." }],
          },
        },
        threadId: "thread-seq",
      }),
      projectCodexOutputFromNotification({
        method: "rawResponseItem/completed",
        params: {},
        threadId: "thread-seq",
      }),
    ]

    let output = ""
    let state = createCodexOutputState()

    for (const projected of sequence) {
      for (const event of projected.events) {
        const next = reduceCodexOutput(output, state, event, {
          prettyMode: true,
        })
        output = next.output
        state = next.state
      }
    }

    expect(output).toBe("First sentence.\nSecond sentence.\n\n")
  })

  test("renders simple tool lifecycle in the transcript", () => {
    const sequence = [
      projectCodexOutputFromNotification({
        method: "codex/event/exec_command_begin",
        params: {
          command: "bun x ultracite check test-mock-codex.ts",
        },
        threadId: "thread-seq",
      }),
      projectCodexOutputFromNotification({
        method: "codex/event/exec_command_output_delta",
        params: {
          delta: "Checked 1 file in 5ms. No fixes applied.",
        },
        threadId: "thread-seq",
      }),
      projectCodexOutputFromNotification({
        method: "codex/event/exec_command_end",
        params: {
          status: "completed",
          exitCode: 0,
        },
        threadId: "thread-seq",
      }),
      projectCodexOutputFromNotification({
        method: "item/completed",
        params: {},
        threadId: "thread-seq",
      }),
    ]

    let output = ""
    let state = createCodexOutputState()

    for (const projected of sequence) {
      for (const event of projected.events) {
        const next = reduceCodexOutput(output, state, event, {
          prettyMode: true,
        })
        output = next.output
        state = next.state
      }
    }

    expect(output).toContain(
      "[tool] `$ bun x ultracite check test-mock-codex.ts`"
    )
    expect(output).toContain("Checked 1 file in 5ms. No fixes applied.")
    expect(output).toContain("[tool] done completed (exit 0)")
    expect(output.endsWith("\n\n")).toBe(true)
  })
})
