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

describe("Codex approval request handling", () => {
  describe("command execution approval", () => {
    test("creates approval_request item for item/commandExecution/requestApproval", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        id: 42,
        method: "item/commandExecution/requestApproval",
        params: {
          itemId: "item-1",
          command: "rm -rf /",
          reason: "needs cleanup",
          cwd: "/tmp",
        },
      })

      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("approval_request")
      expect(created.item.status).toBe("complete")
      expect(created.item.data).toMatchObject({
        requestId: 42,
        requestMethod: "item/commandExecution/requestApproval",
        command: "rm -rf /",
        reason: "needs cleanup",
        cwd: "/tmp",
        requestType: "command_approval",
      })
    })
  })

  describe("file change approval", () => {
    test("creates approval_request item for item/fileChange/requestApproval", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        id: 43,
        method: "item/fileChange/requestApproval",
        params: {
          itemId: "item-2",
          reason: "modifying config",
          grantRoot: "/etc/config",
        },
      })

      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("approval_request")
      expect(created.item.status).toBe("complete")
      expect(created.item.data).toMatchObject({
        requestId: 43,
        requestMethod: "item/fileChange/requestApproval",
        reason: "modifying config",
        grantRoot: "/etc/config",
        requestType: "file_change_approval",
      })
    })
  })

  describe("user input request", () => {
    test("creates approval_request with questions for item/tool/requestUserInput", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        id: 44,
        method: "item/tool/requestUserInput",
        params: {
          threadId: "thread-input",
          turnId: "turn-input",
          questions: [
            { id: "q1", question: "Enter your name", header: "Name" },
          ],
        },
      })

      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("approval_request")
      expect(created.item.status).toBe("complete")
      expect(created.item.data).toMatchObject({
        requestId: 44,
        requestMethod: "item/tool/requestUserInput",
        requiresInput: true,
        requestType: "tool_input_request",
      })
      expect(created.item.data.params).toMatchObject({
        questions: [{ id: "q1", question: "Enter your name", header: "Name" }],
      })
    })

    test("creates approval_request with empty questions for plain text input", () => {
      const state = createCodexStreamAdapterState()
      const actions = adaptCodexMessageToStreamItems(state, {
        id: 45,
        method: "item/tool/requestUserInput",
        params: {
          threadId: "thread-plain",
          turnId: "turn-plain",
          questions: [],
        },
      })

      expect(actions).toHaveLength(1)
      const created = expectCreate(actions[0])
      expect(created.item.type).toBe("approval_request")
      expect(created.item.status).toBe("complete")
      expect(created.item.data).toMatchObject({
        requestId: 45,
        requestMethod: "item/tool/requestUserInput",
        requiresInput: true,
        requestType: "tool_input_request",
      })
      const questions = created.item.data.questions as unknown[]
      expect(questions).toEqual([])
    })
  })
})
