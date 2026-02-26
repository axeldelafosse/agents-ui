import { describe, expect, test } from "bun:test"

import { projectCodexOutputFromNotification } from "@/lib/codex-output-events"
import { createCodexOutputState, reduceCodexOutput } from "@/lib/stream-output"

describe("codex output event projection", () => {
  test("projects item/agentMessage/delta text", () => {
    const projected = projectCodexOutputFromNotification({
      method: "item/agentMessage/delta",
      params: {
        text: "First sentence.",
      },
      threadId: "thread-a",
    })

    expect(projected.events).toEqual([
      {
        method: "item/agentMessage/delta",
        text: "First sentence.",
        threadId: "thread-a",
      },
    ])
  })

  test("ignores mirrored legacy message method variants", () => {
    const projected = projectCodexOutputFromNotification({
      method: "codex/event/agent_message_delta",
      params: {
        text: "legacy",
      },
      threadId: "thread-b",
    })

    expect(projected.events).toEqual([])
  })

  test("maps item/completed", () => {
    const completed = projectCodexOutputFromNotification({
      method: "item/completed",
      params: {},
      threadId: "thread-c",
    })

    expect(completed.events).toEqual([{ method: "item/completed" }])
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

  test("skips tool begin projection when command is missing", () => {
    const projected = projectCodexOutputFromNotification({
      method: "codex/event/exec_command_begin",
      params: {
        call_id: "cmd-unknown",
      },
      threadId: "thread-tool",
    })

    expect(projected.events).toEqual([])
  })

  test("projects tool output delta and reports missing text metadata", () => {
    const projected = projectCodexOutputFromNotification({
      method: "item/commandExecution/outputDelta",
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

    expect(projected.events).toEqual([])
    expect(projected.missingText).toBeUndefined()
  })
})

describe("codex output projection integration sequence", () => {
  test("preserves first sentence and inserts readable boundaries", () => {
    const sequence = [
      projectCodexOutputFromNotification({
        method: "item/agentMessage/delta",
        params: {
          text: "First sentence.",
        },
        threadId: "thread-seq",
      }),
      projectCodexOutputFromNotification({
        method: "item/agentMessage/delta",
        params: {
          text: "Second sentence.",
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

    expect(output).toBe("First sentence.Second sentence.\n\n")
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
        method: "item/commandExecution/outputDelta",
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
