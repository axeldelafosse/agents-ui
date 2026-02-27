import { describe, expect, test } from "bun:test"

import type { StreamItem, StreamItemData } from "@axel-delafosse/protocol/stream-items"

/**
 * Tests for expanded approval decision types.
 *
 * The Codex approval flow supports multiple decision types beyond simple
 * accept/decline. These tests validate the decision type contract and
 * the mapping between decision strings and approval payloads.
 */

const APPROVAL_DECISIONS = [
  "accept",
  "acceptForSession",
  "acceptWithExecpolicyAmendment",
  "decline",
  "cancel",
] as const

type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

function isAcceptDecision(decision: ApprovalDecision): boolean {
  return (
    decision === "accept" ||
    decision === "acceptForSession" ||
    decision === "acceptWithExecpolicyAmendment"
  )
}

function buildApprovalPayload(
  decision: ApprovalDecision,
  requestId: number
): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: requestId,
    result: {
      decision,
      approved: isAcceptDecision(decision),
    },
  }
}

function makeApprovalStreamItem(
  overrides: Partial<StreamItem> & { data: StreamItemData }
): StreamItem {
  return {
    id: "test-approval-item",
    type: "approval_request",
    status: "complete",
    timestamp: Date.now(),
    ...overrides,
  }
}

describe("expanded approval decisions", () => {
  describe("decision type validation", () => {
    for (const decision of APPROVAL_DECISIONS) {
      test(`"${decision}" is a valid decision string`, () => {
        expect(typeof decision).toBe("string")
        expect(decision.length).toBeGreaterThan(0)
      })
    }

    test("all five decision types are accounted for", () => {
      expect(APPROVAL_DECISIONS).toHaveLength(5)
    })
  })

  describe("accept family decisions", () => {
    test("accept maps to approved=true", () => {
      expect(isAcceptDecision("accept")).toBe(true)
    })

    test("acceptForSession maps to approved=true", () => {
      expect(isAcceptDecision("acceptForSession")).toBe(true)
    })

    test("acceptWithExecpolicyAmendment maps to approved=true", () => {
      expect(isAcceptDecision("acceptWithExecpolicyAmendment")).toBe(true)
    })
  })

  describe("reject family decisions", () => {
    test("decline maps to approved=false", () => {
      expect(isAcceptDecision("decline")).toBe(false)
    })

    test("cancel maps to approved=false", () => {
      expect(isAcceptDecision("cancel")).toBe(false)
    })
  })

  describe("approval payload structure", () => {
    test("accept payload includes decision and approved flag", () => {
      const payload = buildApprovalPayload("accept", 42)
      expect(payload).toEqual({
        jsonrpc: "2.0",
        id: 42,
        result: {
          decision: "accept",
          approved: true,
        },
      })
    })

    test("decline payload includes decision and approved=false", () => {
      const payload = buildApprovalPayload("decline", 43)
      expect(payload).toEqual({
        jsonrpc: "2.0",
        id: 43,
        result: {
          decision: "decline",
          approved: false,
        },
      })
    })

    test("acceptForSession payload includes decision and approved=true", () => {
      const payload = buildApprovalPayload("acceptForSession", 44)
      expect(payload).toEqual({
        jsonrpc: "2.0",
        id: 44,
        result: {
          decision: "acceptForSession",
          approved: true,
        },
      })
    })

    test("cancel payload includes decision and approved=false", () => {
      const payload = buildApprovalPayload("cancel", 45)
      expect(payload).toEqual({
        jsonrpc: "2.0",
        id: 45,
        result: {
          decision: "cancel",
          approved: false,
        },
      })
    })

    test("acceptWithExecpolicyAmendment payload is approved", () => {
      const payload = buildApprovalPayload("acceptWithExecpolicyAmendment", 46)
      expect(payload).toEqual({
        jsonrpc: "2.0",
        id: 46,
        result: {
          decision: "acceptWithExecpolicyAmendment",
          approved: true,
        },
      })
    })
  })

  describe("approval request stream item integration", () => {
    test("command approval request carries requestId for response", () => {
      const item = makeApprovalStreamItem({
        data: {
          requestId: 100,
          requestMethod: "item/commandExecution/requestApproval",
          requestType: "command_approval",
          command: "rm -rf /tmp/test",
          reason: "cleanup",
        },
      })
      expect(item.data.requestId).toBe(100)
      expect(item.data.requestType).toBe("command_approval")
    })

    test("file change approval request carries grantRoot", () => {
      const item = makeApprovalStreamItem({
        data: {
          requestId: 101,
          requestMethod: "item/fileChange/requestApproval",
          requestType: "file_change_approval",
          grantRoot: "/etc/config",
          reason: "modifying config",
        },
      })
      expect(item.data.requestId).toBe(101)
      expect(item.data.grantRoot).toBe("/etc/config")
    })

    test("user input request carries requiresInput flag", () => {
      const item = makeApprovalStreamItem({
        data: {
          requestId: 102,
          requestMethod: "item/tool/requestUserInput",
          requestType: "tool_input_request",
          requiresInput: true,
          questions: [{ id: "q1", question: "Enter value" }],
        },
      })
      expect(item.data.requiresInput).toBe(true)
      expect(item.data.requestType).toBe("tool_input_request")
    })

    test("each decision type can be applied to any approval request type", () => {
      const requestTypes = [
        "command_approval",
        "file_change_approval",
        "tool_input_request",
      ] as const

      for (const requestType of requestTypes) {
        for (const decision of APPROVAL_DECISIONS) {
          const payload = buildApprovalPayload(decision, 200)
          expect(payload.result).toBeDefined()
          const result = payload.result as Record<string, unknown>
          expect(result.decision).toBe(decision)
          expect(typeof result.approved).toBe("boolean")

          // Verify the stream item can represent this request type
          const item = makeApprovalStreamItem({
            data: { requestId: 200, requestType },
          })
          expect(item.type).toBe("approval_request")
          expect(item.data.requestType).toBe(requestType)
        }
      }
    })
  })
})
