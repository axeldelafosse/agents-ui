import { describe, expect, test } from "bun:test"
import type {
  StreamItem,
  StreamItemStatus,
} from "@axel-delafosse/protocol/stream-items"
import { compactStreamItems } from "./compact-stream-items"

let counter = 0
function makeItem(
  type: StreamItem["type"],
  data: Record<string, unknown> = {},
  overrides: Partial<StreamItem> = {}
): StreamItem {
  counter++
  return {
    id: `item-${counter}`,
    type,
    status: "complete",
    timestamp: Date.now(),
    data,
    ...overrides,
  }
}

function exploringCmd(
  cmd: string,
  overrides: Partial<StreamItem> = {}
): StreamItem {
  return makeItem("command_execution", { command: cmd }, overrides)
}

function exploringTool(
  toolName: string,
  type: "tool_call" | "tool_result" = "tool_call",
  overrides: Partial<StreamItem> = {}
): StreamItem {
  return makeItem(type, { toolName }, overrides)
}

function message(
  text: string,
  overrides: Partial<StreamItem> = {}
): StreamItem {
  return makeItem("message", { text, role: "assistant" }, overrides)
}

// ---------------------------------------------------------------------------
// Exploring group tests
// ---------------------------------------------------------------------------

describe("exploring groups", () => {
  test("returns empty array for empty input", () => {
    expect(compactStreamItems([])).toEqual([])
  })

  test("wraps non-exploring items as singles", () => {
    const items = [
      message("hello"),
      makeItem("file_change", { path: "foo.ts" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe("single")
    expect(result[1].kind).toBe("single")
  })

  test("groups consecutive exploring command executions", () => {
    const items = [
      exploringCmd("cat foo.ts", { agentId: "a1" }),
      exploringCmd("ls -la", { agentId: "a1" }),
      exploringCmd("grep pattern .", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("exploring-group")
    if (result[0].kind === "exploring-group") {
      expect(result[0].items).toHaveLength(3)
      expect(result[0].groupId).toBe(items[0].id)
    }
  })

  test("groups consecutive exploring tool calls", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
      exploringTool("Glob", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("exploring-group")
    if (result[0].kind === "exploring-group") {
      expect(result[0].items).toHaveLength(3)
    }
  })

  test("single exploring item stays as single (not group of 1)", () => {
    const items = [exploringCmd("cat foo.ts")]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("single")
  })

  test("non-exploring tool_call breaks group", () => {
    const items = [
      exploringCmd("cat a.ts", { agentId: "a1" }),
      exploringCmd("cat b.ts", { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Bash", callId: "c1" }),
      exploringCmd("cat c.ts", { agentId: "a1" }),
      exploringCmd("cat d.ts", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // exploring-group, tool-pair(Bash), exploring-group
    expect(result).toHaveLength(3)
    expect(result[0].kind).toBe("exploring-group")
    expect(result[1].kind).toBe("tool-pair")
    expect(result[2].kind).toBe("exploring-group")
  })

  test("groups never cross agentId boundary", () => {
    const items = [
      exploringCmd("cat a.ts", { agentId: "agent-1" }),
      exploringCmd("cat b.ts", { agentId: "agent-1" }),
      exploringCmd("cat c.ts", { agentId: "agent-2" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe("exploring-group")
    expect(result[1].kind).toBe("single")
  })

  test("groups never cross turnId boundary", () => {
    const items = [
      exploringCmd("cat a.ts", { turnId: "turn-1" }),
      exploringCmd("cat b.ts", { turnId: "turn-1" }),
      exploringCmd("cat c.ts", { turnId: "turn-2" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe("exploring-group")
    expect(result[1].kind).toBe("single")
  })

  test("group status is streaming if any child is streaming", () => {
    const items = [
      exploringCmd("cat a.ts", {
        agentId: "a1",
        status: "complete" as StreamItemStatus,
      }),
      exploringCmd("cat b.ts", {
        agentId: "a1",
        status: "streaming" as StreamItemStatus,
      }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    if (result[0].kind === "exploring-group") {
      expect(result[0].status).toBe("streaming")
    }
  })

  test("group status is error if any child has error", () => {
    const items = [
      exploringCmd("cat a.ts", {
        agentId: "a1",
        status: "complete" as StreamItemStatus,
      }),
      exploringCmd("cat b.ts", {
        agentId: "a1",
        status: "error" as StreamItemStatus,
      }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    if (result[0].kind === "exploring-group") {
      expect(result[0].status).toBe("error")
    }
  })

  test("groupId is stable (uses first item id)", () => {
    const items = [
      exploringCmd("cat a.ts", { agentId: "a1" }),
      exploringCmd("cat b.ts", { agentId: "a1" }),
    ]
    const result1 = compactStreamItems(items)
    const result2 = compactStreamItems(items)
    if (
      result1[0].kind === "exploring-group" &&
      result2[0].kind === "exploring-group"
    ) {
      expect(result1[0].groupId).toBe(result2[0].groupId)
      expect(result1[0].groupId).toBe(items[0].id)
    }
  })

  test("unscoped items group when contiguous", () => {
    const items = [
      exploringTool("Read", "tool_call", { id: "unscoped-a" }),
      exploringTool("Grep", "tool_call", { id: "unscoped-b" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("exploring-group")
  })
})

// ---------------------------------------------------------------------------
// Phase 1: Exploring groups absorb paired results
// ---------------------------------------------------------------------------

describe("exploring groups absorb paired results", () => {
  test("exploring tool_call followed by its tool_result are absorbed into the same group", () => {
    const items = [
      makeItem("tool_call", { toolName: "Read", callId: "c1" }, { agentId: "a1" }),
      makeItem("thinking", { text: "pondering" }, { agentId: "a1" }),
      makeItem("tool_result", { toolName: "Read", callId: "c1" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // The tool_result matches a pending exploring call → absorbed into group
    // The thinking is transparent → deferred after the group
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(1)
    if (exploringGroups[0].kind === "exploring-group") {
      // Group should contain the tool_call and its matching tool_result
      expect(exploringGroups[0].items).toHaveLength(2)
      expect(exploringGroups[0].items[0].type).toBe("tool_call")
      expect(exploringGroups[0].items[1].type).toBe("tool_result")
    }
  })

  test("non-matching tool_result breaks the group", () => {
    const items = [
      makeItem("tool_call", { toolName: "Read", callId: "c1" }, { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Grep", callId: "c2" }, { agentId: "a1" }),
      makeItem("tool_result", { toolName: "Bash", callId: "c-other" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // The tool_result callId doesn't match any pending exploring callId → breaks the group
    // First two exploring items form a group, tool_result is a single (orphan)
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe("exploring-group")
    if (result[0].kind === "exploring-group") {
      expect(result[0].items).toHaveLength(2)
    }
    expect(result[1].kind).toBe("single")
    if (result[1].kind === "single") {
      expect(result[1].item.type).toBe("tool_result")
    }
  })

  test("multiple exploring calls with interleaved results all absorbed", () => {
    const items = [
      makeItem("tool_call", { toolName: "Read", callId: "c1" }, { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Grep", callId: "c2" }, { agentId: "a1" }),
      makeItem("tool_result", { toolName: "Read", callId: "c1" }, { agentId: "a1" }),
      makeItem("tool_result", { toolName: "Grep", callId: "c2" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // All four items should be in one exploring group
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("exploring-group")
    if (result[0].kind === "exploring-group") {
      expect(result[0].items).toHaveLength(4)
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 2: Transparent items don't break exploring groups
// ---------------------------------------------------------------------------

describe("transparent items in exploring groups", () => {
  test("thinking between exploring items does not break group", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      makeItem("thinking", { text: "pondering" }, { agentId: "a1" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // Exploring items form one group; thinking is deferred as single
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(1)
    if (exploringGroups[0].kind === "exploring-group") {
      expect(exploringGroups[0].items).toHaveLength(2)
    }
    // The thinking item should appear as a single
    const singles = result.filter((g) => g.kind === "single")
    expect(singles).toHaveLength(1)
    if (singles[0].kind === "single") {
      expect(singles[0].item.type).toBe("thinking")
    }
  })

  test("assistant message between exploring items does not break group", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      message("I see some files", { agentId: "a1" }),
      exploringTool("Glob", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // Exploring items form one group; assistant message is deferred
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(1)
    if (exploringGroups[0].kind === "exploring-group") {
      expect(exploringGroups[0].items).toHaveLength(2)
    }
    const singles = result.filter((g) => g.kind === "single")
    expect(singles).toHaveLength(1)
    if (singles[0].kind === "single") {
      expect(singles[0].item.type).toBe("message")
    }
  })

  test("reasoning between exploring items does not break group", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      makeItem("reasoning", { summary: "evaluating" }, { agentId: "a1" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(1)
    if (exploringGroups[0].kind === "exploring-group") {
      expect(exploringGroups[0].items).toHaveLength(2)
    }
    const singles = result.filter((g) => g.kind === "single")
    expect(singles).toHaveLength(1)
    if (singles[0].kind === "single") {
      expect(singles[0].item.type).toBe("reasoning")
    }
  })

  test("user message between exploring items breaks group", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      makeItem("message", { text: "hello", role: "user" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // User message is NOT transparent → breaks the group
    // First exploring item is single (only 1), user msg is single, second exploring is single
    expect(result).toHaveLength(3)
    expect(result[0].kind).toBe("single")
    if (result[0].kind === "single") {
      expect(result[0].item.type).toBe("tool_call")
    }
    expect(result[1].kind).toBe("single")
    if (result[1].kind === "single") {
      expect(result[1].item.type).toBe("message")
    }
    expect(result[2].kind).toBe("single")
    if (result[2].kind === "single") {
      expect(result[2].item.type).toBe("tool_call")
    }
  })

  test("non-exploring tool_call between exploring items breaks group", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Bash", callId: "call-1" }),
      exploringTool("Glob", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // First two exploring items form a group, Bash breaks it, Glob is single
    expect(result).toHaveLength(3)
    expect(result[0].kind).toBe("exploring-group")
    expect(result[1].kind).toBe("tool-pair")
    expect(result[2].kind).toBe("single")
  })

  test("mixed transparent items between exploring items", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      makeItem("thinking", { text: "pondering" }, { agentId: "a1" }),
      message("I see something", { agentId: "a1" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
      makeItem("reasoning", { summary: "evaluating" }, { agentId: "a1" }),
      exploringTool("Glob", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // All three exploring items form one group
    // The thinking, message, and reasoning are deferred as singles
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(1)
    if (exploringGroups[0].kind === "exploring-group") {
      expect(exploringGroups[0].items).toHaveLength(3)
    }
    // Three transparent items as singles
    const singles = result.filter((g) => g.kind === "single")
    expect(singles).toHaveLength(3)
  })

  test("exploring results absorbed even with transparent items interleaved", () => {
    const items = [
      makeItem("tool_call", { toolName: "Read", callId: "c1" }, { agentId: "a1" }),
      makeItem("thinking", { text: "pondering" }, { agentId: "a1" }),
      makeItem("tool_result", { toolName: "Read", callId: "c1" }, { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Grep", callId: "c2" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // Phase 1: tool_result(c1) matches pending callId c1 → absorbed
    // Phase 2: thinking is transparent → deferred
    // Result: exploring-group with Read call + result + Grep call (3 items), thinking as single
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(1)
    if (exploringGroups[0].kind === "exploring-group") {
      expect(exploringGroups[0].items).toHaveLength(3)
      expect(exploringGroups[0].items[0].data.toolName).toBe("Read")
      expect(exploringGroups[0].items[0].type).toBe("tool_call")
      expect(exploringGroups[0].items[1].type).toBe("tool_result")
      expect(exploringGroups[0].items[2].data.toolName).toBe("Grep")
    }
    const singles = result.filter((g) => g.kind === "single")
    expect(singles).toHaveLength(1)
    if (singles[0].kind === "single") {
      expect(singles[0].item.type).toBe("thinking")
    }
  })
})

// ---------------------------------------------------------------------------
// Noise filtering tests
// ---------------------------------------------------------------------------

describe("noise filtering", () => {
  test("filters out turn_complete items", () => {
    const items = [
      message("hello"),
      makeItem("turn_complete", {}),
      message("world"),
    ]
    const result = compactStreamItems(items)
    // turn_complete should be gone; two messages may form a message-block
    const allItems = result.flatMap((g) => {
      if (g.kind === "single") return [g.item]
      if (g.kind === "message-block") return g.items
      return []
    })
    expect(allItems.every((i) => i.type !== "turn_complete")).toBe(true)
  })

  test("filters out raw_item by default", () => {
    const items = [
      message("hello"),
      makeItem("raw_item", { payload: "debug" }),
    ]
    const result = compactStreamItems(items)
    const allItems = result.flatMap((g) => {
      if (g.kind === "single") return [g.item]
      return []
    })
    expect(allItems.every((i) => i.type !== "raw_item")).toBe(true)
  })

  test("filters out idle/running status items", () => {
    const items = [
      makeItem("status", { message: "idle" }),
      message("hello"),
      makeItem("status", { message: "running" }),
    ]
    const result = compactStreamItems(items)
    const statusItems = result.filter(
      (g) => g.kind === "single" && g.item.type === "status"
    )
    expect(statusItems).toHaveLength(0)
  })

  test("preserves meaningful status items", () => {
    const items = [
      makeItem("status", {
        message: "Connected to the Codex app-server",
      }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("single")
  })
})

// ---------------------------------------------------------------------------
// Tool pairing tests
// ---------------------------------------------------------------------------

describe("tool pairing", () => {
  test("pairs tool_call with matching tool_result by callId", () => {
    const items = [
      makeItem("tool_call", {
        toolName: "Bash",
        callId: "call-1",
      }),
      makeItem("tool_result", {
        callId: "call-1",
        result: "output",
      }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("tool-pair")
    if (result[0].kind === "tool-pair") {
      expect(result[0].call.data.toolName).toBe("Bash")
      expect(result[0].result).not.toBeNull()
    }
  })

  test("tool_call without result stays as pending pair", () => {
    const items = [
      makeItem("tool_call", {
        toolName: "Bash",
        callId: "call-2",
      }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("tool-pair")
    if (result[0].kind === "tool-pair") {
      expect(result[0].result).toBeNull()
    }
  })

  test("orphan tool_result without matching call stays as single", () => {
    const items = [
      makeItem("tool_result", {
        callId: "no-matching-call",
        result: "output",
      }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("single")
  })

  test("tool_call without callId stays as single", () => {
    const items = [
      makeItem("tool_call", {
        toolName: "Bash",
      }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("single")
  })

  test("exploring tool_call with callId gets grouped, not paired", () => {
    // Exploring tools (Read, Grep) should be grouped into exploring-groups,
    // not into tool-pairs. The exploring grouping takes precedence.
    const items = [
      makeItem("tool_call", {
        toolName: "Read",
        callId: "call-3",
      }, { agentId: "a1" }),
      makeItem("tool_result", {
        toolName: "Read",
        callId: "call-3",
      }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // Both are exploring items from same scope -> exploring-group
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("exploring-group")
  })

  test("pair status derives correctly", () => {
    const items = [
      makeItem("tool_call", {
        toolName: "Bash",
        callId: "call-err",
        status: "complete",
      }),
      makeItem("tool_result", {
        callId: "call-err",
        error: "command failed",
      }, { status: "error" as StreamItemStatus }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    if (result[0].kind === "tool-pair") {
      expect(result[0].status).toBe("error")
    }
  })

  test("duplicate callId tool_call does not overwrite first pairing", () => {
    const items = [
      makeItem("tool_call", {
        toolName: "Bash",
        callId: "dup-1",
      }),
      makeItem("tool_call", {
        toolName: "Bash",
        callId: "dup-1",
      }),
      makeItem("tool_result", {
        callId: "dup-1",
        result: "output",
      }),
    ]
    const result = compactStreamItems(items)
    // First call gets paired with result, second stays as pending pair
    const pairs = result.filter((g) => g.kind === "tool-pair")
    expect(pairs).toHaveLength(2)
    if (pairs[0].kind === "tool-pair" && pairs[1].kind === "tool-pair") {
      expect(pairs[0].result).not.toBeNull()
      expect(pairs[1].result).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// Message block grouping tests
// ---------------------------------------------------------------------------

describe("message block grouping", () => {
  test("groups consecutive assistant messages from same scope", () => {
    const items = [
      message("Part 1", { agentId: "a1", turnId: "t1" }),
      message("Part 2", { agentId: "a1", turnId: "t1" }),
      message("Part 3", { agentId: "a1", turnId: "t1" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("message-block")
    if (result[0].kind === "message-block") {
      expect(result[0].items).toHaveLength(3)
    }
  })

  test("single assistant message stays as single", () => {
    const items = [message("Solo")]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("single")
  })

  test("user messages are never grouped into blocks", () => {
    const items = [
      makeItem("message", { text: "Hello", role: "user" }),
      makeItem("message", { text: "World", role: "user" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe("single")
    expect(result[1].kind).toBe("single")
  })

  test("messages from different scopes create separate blocks", () => {
    const items = [
      message("A", { agentId: "a1" }),
      message("B", { agentId: "a1" }),
      message("C", { agentId: "a2" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(2)
    // First two form a block, third is a single
    expect(result[0].kind).toBe("message-block")
    expect(result[1].kind).toBe("single")
  })

  test("non-message items break message blocks", () => {
    const items = [
      message("Part 1", { agentId: "a1" }),
      message("Part 2", { agentId: "a1" }),
      makeItem("file_change", { path: "x.ts" }),
      message("Part 3", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // message-block(2), single(file_change), single(message)
    expect(result).toHaveLength(3)
    expect(result[0].kind).toBe("message-block")
    expect(result[1].kind).toBe("single")
    expect(result[2].kind).toBe("single")
  })
})

// ---------------------------------------------------------------------------
// Thinking block grouping tests
// ---------------------------------------------------------------------------

describe("thinking block grouping", () => {
  test("groups consecutive thinking items from same scope", () => {
    const items = [
      makeItem("thinking", { text: "step 1" }, { agentId: "a1" }),
      makeItem("thinking", { text: "step 2" }, { agentId: "a1" }),
      makeItem("thinking", { text: "step 3" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("thinking-block")
    if (result[0].kind === "thinking-block") {
      expect(result[0].items).toHaveLength(3)
    }
  })

  test("groups consecutive reasoning items from same scope", () => {
    const items = [
      makeItem("reasoning", { summary: "analyzing" }, { agentId: "a1" }),
      makeItem("reasoning", { summary: "evaluating" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("thinking-block")
    if (result[0].kind === "thinking-block") {
      expect(result[0].items).toHaveLength(2)
    }
  })

  test("groups mixed thinking and reasoning items", () => {
    const items = [
      makeItem("thinking", { text: "pondering" }, { agentId: "a1" }),
      makeItem("reasoning", { summary: "concluding" }, { agentId: "a1" }),
      makeItem("thinking", { text: "more thoughts" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("thinking-block")
    if (result[0].kind === "thinking-block") {
      expect(result[0].items).toHaveLength(3)
    }
  })

  test("single thinking item stays as single", () => {
    const items = [
      makeItem("thinking", { text: "one thought" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("single")
  })

  test("non-thinking item breaks group", () => {
    const items = [
      makeItem("thinking", { text: "thought 1" }, { agentId: "a1" }),
      makeItem("thinking", { text: "thought 2" }, { agentId: "a1" }),
      message("response text", { agentId: "a1" }),
      makeItem("thinking", { text: "thought 3" }, { agentId: "a1" }),
      makeItem("thinking", { text: "thought 4" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // thinking-block, single message, thinking-block
    expect(result).toHaveLength(3)
    expect(result[0].kind).toBe("thinking-block")
    expect(result[1].kind).toBe("single")
    expect(result[2].kind).toBe("thinking-block")
  })

  test("groups never cross scope boundaries", () => {
    const items = [
      makeItem("thinking", { text: "agent1 thought" }, { agentId: "a1" }),
      makeItem("thinking", { text: "agent1 thought2" }, { agentId: "a1" }),
      makeItem("thinking", { text: "agent2 thought" }, { agentId: "a2" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe("thinking-block")
    expect(result[1].kind).toBe("single")
    if (result[0].kind === "thinking-block") {
      expect(result[0].items).toHaveLength(2)
    }
  })

  test("status derives correctly (streaming > error > complete)", () => {
    const streamingItems = [
      makeItem("thinking", { text: "done" }, {
        agentId: "a1",
        status: "complete" as StreamItemStatus,
      }),
      makeItem("thinking", { text: "still going" }, {
        agentId: "a1",
        status: "streaming" as StreamItemStatus,
      }),
    ]
    const streamingResult = compactStreamItems(streamingItems)
    expect(streamingResult).toHaveLength(1)
    if (streamingResult[0].kind === "thinking-block") {
      expect(streamingResult[0].status).toBe("streaming")
    }

    const errorItems = [
      makeItem("thinking", { text: "ok" }, {
        agentId: "a1",
        status: "complete" as StreamItemStatus,
      }),
      makeItem("thinking", { text: "failed" }, {
        agentId: "a1",
        status: "error" as StreamItemStatus,
      }),
    ]
    const errorResult = compactStreamItems(errorItems)
    expect(errorResult).toHaveLength(1)
    if (errorResult[0].kind === "thinking-block") {
      expect(errorResult[0].status).toBe("error")
    }

    const completeItems = [
      makeItem("thinking", { text: "done1" }, {
        agentId: "a1",
        status: "complete" as StreamItemStatus,
      }),
      makeItem("thinking", { text: "done2" }, {
        agentId: "a1",
        status: "complete" as StreamItemStatus,
      }),
    ]
    const completeResult = compactStreamItems(completeItems)
    expect(completeResult).toHaveLength(1)
    if (completeResult[0].kind === "thinking-block") {
      expect(completeResult[0].status).toBe("complete")
    }
  })
})

// ---------------------------------------------------------------------------
// Integration: full pipeline
// ---------------------------------------------------------------------------

describe("full compaction pipeline", () => {
  test("mixed stream produces correct layout", () => {
    const items = [
      makeItem("message", { text: "start", role: "user" }),
      exploringCmd("cat a.ts", { agentId: "a1" }),
      exploringCmd("ls src/", { agentId: "a1" }),
      message("I found the files", { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Bash", callId: "c1" }),
      makeItem("tool_result", { callId: "c1", result: "ok" }),
      makeItem("file_change", { path: "fix.ts" }),
      message("Done!", { agentId: "a1" }),
      makeItem("turn_complete", {}),
    ]
    const result = compactStreamItems(items)

    const kinds = result.map((g) => g.kind)
    // user message (single), exploring-group, assistant message (single),
    // tool-pair, file_change (single), assistant message (single)
    // turn_complete is filtered out
    expect(kinds).not.toContain("turn_complete")
    expect(kinds).toContain("exploring-group")
    expect(kinds).toContain("tool-pair")
  })
})

// ---------------------------------------------------------------------------
// Phase 1+2 duplicate blocks (consolidated above)
// ---------------------------------------------------------------------------

describe("pendingCallIds cleanup", () => {
  test("duplicate non-exploring tool_result for same callId is not absorbed twice", () => {
    // tool_result without a recognized exploring toolName — absorbed via callId match only
    const items = [
      makeItem("tool_call", { toolName: "Read", callId: "c1" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "c1" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "c1" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // First tool_result absorbed via callId match, c1 is then cleared.
    // Second tool_result: callId c1 no longer pending, not exploring → flushes group.
    const groups = result.filter((g) => g.kind === "exploring-group")
    expect(groups).toHaveLength(1)
    if (groups[0].kind === "exploring-group") {
      // Only the call + first result
      expect(groups[0].items).toHaveLength(2)
    }
    // The duplicate result should be a separate single
    const singles = result.filter((g) => g.kind === "single")
    expect(singles).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Scope isolation tests
// ---------------------------------------------------------------------------

describe("scope isolation", () => {
  test("cross-scope tool_result is not absorbed into exploring group", () => {
    const items = [
      makeItem("tool_call", { toolName: "Read", callId: "c1" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "c1" }, { agentId: "a2" }),
    ]
    const result = compactStreamItems(items)
    // tool_result from different agent should NOT be absorbed
    // Read call is single (only 1 exploring item), tool_result is orphan single
    expect(result).toHaveLength(2)
    if (result[0].kind === "single") {
      expect(result[0].item.type).toBe("tool_call")
    }
    if (result[1].kind === "single") {
      expect(result[1].item.type).toBe("tool_result")
    }
  })

  test("cross-scope tool_result does not pair with tool_call from different scope", () => {
    const items = [
      makeItem("tool_call", { toolName: "Bash", callId: "c1" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "c1" }, { agentId: "a2" }),
    ]
    const result = compactStreamItems(items)
    // tool_call becomes a pending tool-pair, tool_result from different scope is orphan
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe("tool-pair")
    if (result[0].kind === "tool-pair") {
      expect(result[0].result).toBeNull()
    }
    expect(result[1].kind).toBe("single")
  })

  test("same-scope tool pairing still works correctly", () => {
    const items = [
      makeItem("tool_call", { toolName: "Bash", callId: "c1" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "c1" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("tool-pair")
    if (result[0].kind === "tool-pair") {
      expect(result[0].result).not.toBeNull()
    }
  })

  test("cross-scope transparent item breaks exploring group", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      makeItem("thinking", { text: "pondering" }, { agentId: "a2" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // thinking from a2 should NOT be deferred — it should break the group
    // Result: Read single, thinking single, Grep single (no group formed)
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(0)
    expect(result).toHaveLength(3)
  })

  test("same-scope transparent item is still deferred correctly", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      makeItem("thinking", { text: "pondering" }, { agentId: "a1" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(1)
    if (exploringGroups[0].kind === "exploring-group") {
      expect(exploringGroups[0].items).toHaveLength(2)
    }
  })
})

describe("unscoped transparent items and scope guard", () => {
  test("unscoped transparent item does NOT bridge a scoped exploring group", () => {
    // An unscoped thinking item between scoped exploring calls must NOT
    // be deferred — it should break the group, since its scope doesn't match.
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      // thinking with no scope dimensions — __unscoped__
      makeItem("thinking", { text: "pondering" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // The unscoped thinking should break the group (scope mismatch)
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(0)
    expect(result).toHaveLength(3)
  })

  test("unscoped transparent item between unscoped exploring items is deferred", () => {
    // When both the group and the transparent item are unscoped, they match
    const items = [
      exploringTool("Read", "tool_call"),
      makeItem("thinking", { text: "pondering" }),
      exploringTool("Grep", "tool_call"),
    ]
    const result = compactStreamItems(items)
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(1)
    if (exploringGroups[0].kind === "exploring-group") {
      expect(exploringGroups[0].items).toHaveLength(2)
    }
    const singles = result.filter((g) => g.kind === "single")
    expect(singles).toHaveLength(1)
    if (singles[0].kind === "single") {
      expect(singles[0].item.type).toBe("thinking")
    }
  })
})

describe("transparent role tightening", () => {
  test("message with no role between exploring items breaks group", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      makeItem("message", { text: "unknown role" }, { agentId: "a1" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    // Message with no role is NOT transparent → breaks the group
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(0)
    expect(result).toHaveLength(3)
  })

  test("message with explicit assistant role is still transparent", () => {
    const items = [
      exploringTool("Read", "tool_call", { agentId: "a1" }),
      message("I'm exploring", { agentId: "a1" }),
      exploringTool("Grep", "tool_call", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    const exploringGroups = result.filter((g) => g.kind === "exploring-group")
    expect(exploringGroups).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Phase 7: Regression fixtures — acceptance gate
// ---------------------------------------------------------------------------

describe("callId alias coverage", () => {
  test("call_id alias is recognized for tool pairing", () => {
    const items = [
      makeItem("tool_call", { toolName: "Bash", call_id: "alias-1" }),
      makeItem("tool_result", { call_id: "alias-1", result: "ok" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("tool-pair")
    if (result[0].kind === "tool-pair") {
      expect(result[0].result).not.toBeNull()
    }
  })

  test("toolCallId alias is recognized for tool pairing", () => {
    const items = [
      makeItem("tool_call", { toolName: "Bash", toolCallId: "alias-2" }),
      makeItem("tool_result", { toolCallId: "alias-2", result: "ok" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("tool-pair")
    if (result[0].kind === "tool-pair") {
      expect(result[0].result).not.toBeNull()
    }
  })

  test("tool_use_id alias is recognized for tool pairing", () => {
    const items = [
      makeItem("tool_call", { toolName: "Bash", tool_use_id: "alias-3" }),
      makeItem("tool_result", { tool_use_id: "alias-3", result: "ok" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("tool-pair")
    if (result[0].kind === "tool-pair") {
      expect(result[0].result).not.toBeNull()
    }
  })

  test("mixed callId aliases on call and result still pair correctly", () => {
    const items = [
      makeItem("tool_call", { toolName: "Bash", callId: "mixed-1" }),
      makeItem("tool_result", { tool_use_id: "mixed-1", result: "ok" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("tool-pair")
    if (result[0].kind === "tool-pair") {
      expect(result[0].result).not.toBeNull()
    }
  })

  test("callId alias works for exploring group result absorption", () => {
    const items = [
      makeItem("tool_call", { toolName: "Read", tool_use_id: "exp-alias-1" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "exp-alias-1" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("exploring-group")
    if (result[0].kind === "exploring-group") {
      expect(result[0].items).toHaveLength(2)
    }
  })
})

describe("regression fixtures (Phase 7 acceptance gate)", () => {
  test("fixture 1: explore burst — 5+ consecutive Read/Grep/Glob from same agent", () => {
    const items = [
      makeItem("tool_call", { toolName: "Read", callId: "r1" }, { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Grep", callId: "r2" }, { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Glob", callId: "r3" }, { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Read", callId: "r4" }, { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Read", callId: "r5" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "r1" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "r2" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "r3" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "r4" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "r5" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe("exploring-group")
    if (result[0].kind === "exploring-group") {
      expect(result[0].items).toHaveLength(10)
    }
  })

  test("fixture 2: delayed tool results — tool_call → thinking → tool_result absorbed", () => {
    const items = [
      makeItem("tool_call", { toolName: "Read", callId: "d1" }, { agentId: "a1" }),
      makeItem("thinking", { text: "reading file" }, { agentId: "a1" }),
      makeItem("tool_result", { callId: "d1", output: "file content" }, { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    const groups = result.filter((g) => g.kind === "exploring-group")
    expect(groups).toHaveLength(1)
    if (groups[0].kind === "exploring-group") {
      expect(groups[0].items).toHaveLength(2) // call + result
      expect(groups[0].items[0].type).toBe("tool_call")
      expect(groups[0].items[1].type).toBe("tool_result")
    }
    // thinking deferred as single
    const singles = result.filter((g) => g.kind === "single")
    expect(singles).toHaveLength(1)
    if (singles[0].kind === "single") {
      expect(singles[0].item.type).toBe("thinking")
    }
  })

  test("fixture 3: thinking interleaving — exploring → thinking → exploring → one group", () => {
    const items = [
      exploringCmd("cat a.ts", { agentId: "a1" }),
      makeItem("thinking", { text: "analyzing" }, { agentId: "a1" }),
      exploringCmd("cat b.ts", { agentId: "a1" }),
      makeItem("reasoning", { summary: "evaluating" }, { agentId: "a1" }),
      exploringCmd("cat c.ts", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    const groups = result.filter((g) => g.kind === "exploring-group")
    expect(groups).toHaveLength(1)
    if (groups[0].kind === "exploring-group") {
      expect(groups[0].items).toHaveLength(3)
    }
    // thinking + reasoning deferred and then merged into a thinking-block by Phase 3
    const thinkingBlocks = result.filter((g) => g.kind === "thinking-block")
    expect(thinkingBlocks).toHaveLength(1)
    if (thinkingBlocks[0].kind === "thinking-block") {
      expect(thinkingBlocks[0].items).toHaveLength(2)
    }
  })

  test("fixture 4: cross-scope tool_result not absorbed into wrong exploring group", () => {
    const items = [
      makeItem("tool_call", { toolName: "Read", callId: "x1" }, { agentId: "agent-1" }),
      makeItem("tool_call", { toolName: "Grep", callId: "x2" }, { agentId: "agent-1" }),
      // tool_result from a different agent with same callId — must NOT be absorbed
      makeItem("tool_result", { callId: "x1" }, { agentId: "agent-2" }),
      // tool_result from correct scope
      makeItem("tool_result", { callId: "x2" }, { agentId: "agent-1" }),
    ]
    const result = compactStreamItems(items)
    // x1 call starts group, x2 call extends group, x1 result from agent-2
    // has mismatched scope → flushes the group. x2 result from agent-1 has
    // no pending group to absorb into.
    // Exact expected layout:
    const kinds = result.map((g) => g.kind)
    expect(kinds).toEqual([
      "exploring-group",  // Read(x1) + Grep(x2) from agent-1
      "single",           // orphan tool_result(x1) from agent-2
      "single",           // orphan tool_result(x2) from agent-1 (group already flushed)
    ])
    if (result[0].kind === "exploring-group") {
      expect(result[0].items).toHaveLength(2)
      expect(result[0].items.every((i) => i.agentId === "agent-1")).toBe(true)
      expect(result[0].items.every((i) => i.type === "tool_call")).toBe(true)
    }
    // Verify the orphan results' types
    if (result[1].kind === "single") {
      expect(result[1].item.type).toBe("tool_result")
      expect(result[1].item.agentId).toBe("agent-2")
    }
    if (result[2].kind === "single") {
      expect(result[2].item.type).toBe("tool_result")
      expect(result[2].item.agentId).toBe("agent-1")
    }
  })

  test("fixture 5: scope boundary — exploring calls from different agents never merge", () => {
    const items = [
      exploringCmd("cat a.ts", { agentId: "agent-1" }),
      exploringCmd("cat b.ts", { agentId: "agent-1" }),
      exploringCmd("cat c.ts", { agentId: "agent-1" }),
      exploringCmd("cat d.ts", { agentId: "agent-2" }),
      exploringCmd("cat e.ts", { agentId: "agent-2" }),
    ]
    const result = compactStreamItems(items)
    const groups = result.filter((g) => g.kind === "exploring-group")
    expect(groups).toHaveLength(2)
    if (groups[0].kind === "exploring-group" && groups[1].kind === "exploring-group") {
      expect(groups[0].items).toHaveLength(3)
      expect(groups[1].items).toHaveLength(2)
    }
  })

  test("fixture 6: non-exploring break — exploring → Bash → exploring → two separate groups", () => {
    const items = [
      exploringCmd("cat a.ts", { agentId: "a1" }),
      exploringCmd("cat b.ts", { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Bash", callId: "bash-1" }),
      exploringCmd("cat c.ts", { agentId: "a1" }),
      exploringCmd("cat d.ts", { agentId: "a1" }),
    ]
    const result = compactStreamItems(items)
    const groups = result.filter((g) => g.kind === "exploring-group")
    expect(groups).toHaveLength(2)
    const pairs = result.filter((g) => g.kind === "tool-pair")
    expect(pairs).toHaveLength(1)
  })

  test("fixture 7: full pipeline — user msg → exploring group → tool pair → assistant msg → turn_complete filtered", () => {
    const items = [
      makeItem("message", { text: "Fix the bug", role: "user" }),
      makeItem("thinking", { text: "analyzing" }, { agentId: "a1" }),
      exploringCmd("cat src/main.ts", { agentId: "a1" }),
      exploringCmd("grep error src/", { agentId: "a1" }),
      exploringCmd("cat src/utils.ts", { agentId: "a1" }),
      message("I found the issue", { agentId: "a1" }),
      makeItem("tool_call", { toolName: "Edit", callId: "edit-1" }),
      makeItem("tool_result", { callId: "edit-1", result: "applied" }),
      message("Fixed the bug!", { agentId: "a1" }),
      makeItem("turn_complete", {}),
    ]
    const result = compactStreamItems(items)
    const kinds = result.map((g) => g.kind)

    // Strict shape: verify exact expected layout
    // user msg (single), thinking (single), exploring-group, assistant msg (single), tool-pair, assistant msg (single)
    expect(kinds).toEqual([
      "single",           // user message
      "single",           // thinking (deferred from exploring group)
      "exploring-group",  // 3 exploring commands
      "single",           // assistant message "I found the issue"
      "tool-pair",        // Edit call + result
      "single",           // assistant message "Fixed the bug!"
    ])

    // Verify no turn_complete items remain anywhere
    for (const g of result) {
      if (g.kind === "single") {
        expect(g.item.type).not.toBe("turn_complete")
      }
    }

    // Verify specific item types in order
    if (result[0].kind === "single") {
      expect(result[0].item.type).toBe("message")
      expect(result[0].item.data.role).toBe("user")
    }
    if (result[1].kind === "single") {
      expect(result[1].item.type).toBe("thinking")
    }
    if (result[2].kind === "exploring-group") {
      expect(result[2].items).toHaveLength(3)
    }
    if (result[3].kind === "single") {
      expect(result[3].item.type).toBe("message")
      expect(result[3].item.data.role).toBe("assistant")
    }
    if (result[4].kind === "tool-pair") {
      expect(result[4].result).not.toBeNull()
    }
    if (result[5].kind === "single") {
      expect(result[5].item.type).toBe("message")
      expect(result[5].item.data.role).toBe("assistant")
    }
  })
})
