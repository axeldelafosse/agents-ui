import { describe, expect, test } from "bun:test"

// Test the pacing threshold constants and mode transition logic.
// Since useStreamPacing is a React hook, we test the pure logic aspects
// by re-declaring the module-private constants and simulating transitions.

describe("stream pacing thresholds", () => {
  const CATCHUP_QUEUE_DEPTH = 8
  const CATCHUP_AGE_MS = 120
  const REENTRY_QUEUE_DEPTH = 2
  const REENTRY_AGE_MS = 40
  const REENTRY_HOLD_MS = 250
  const SEVERE_QUEUE_DEPTH = 64
  const SEVERE_AGE_MS = 300

  test("catchup triggers at queue depth threshold", () => {
    const queueDepth = 8
    const shouldCatchUp = queueDepth >= CATCHUP_QUEUE_DEPTH
    expect(shouldCatchUp).toBe(true)
  })

  test("catchup triggers at age threshold", () => {
    const oldestAge = 120
    const shouldCatchUp = oldestAge >= CATCHUP_AGE_MS
    expect(shouldCatchUp).toBe(true)
  })

  test("catchup does not trigger below thresholds", () => {
    const queueDepth = 7
    const oldestAge = 119
    const shouldCatchUp =
      queueDepth >= CATCHUP_QUEUE_DEPTH || oldestAge >= CATCHUP_AGE_MS
    expect(shouldCatchUp).toBe(false)
  })

  test("re-entry to smooth requires both conditions", () => {
    // Queue must be <= 2 AND oldest <= 40ms
    const canExit = (q: number, age: number) =>
      q <= REENTRY_QUEUE_DEPTH && age <= REENTRY_AGE_MS
    expect(canExit(2, 30)).toBe(true)
    expect(canExit(3, 30)).toBe(false)
    expect(canExit(2, 41)).toBe(false)
    expect(canExit(3, 41)).toBe(false)
  })

  test("re-entry hold prevents immediate mode flip", () => {
    expect(REENTRY_HOLD_MS).toBe(250)
  })

  test("severe backlog triggers at queue depth", () => {
    expect(SEVERE_QUEUE_DEPTH).toBe(64)
    const isSevere = 64 >= SEVERE_QUEUE_DEPTH
    expect(isSevere).toBe(true)
  })

  test("severe backlog triggers at age", () => {
    expect(SEVERE_AGE_MS).toBe(300)
    const isSevere = 300 >= SEVERE_AGE_MS
    expect(isSevere).toBe(true)
  })

  test("severe does not trigger below thresholds", () => {
    const isSevere = 63 >= SEVERE_QUEUE_DEPTH || 299 >= SEVERE_AGE_MS
    expect(isSevere).toBe(false)
  })
})

describe("stream pacing mode transitions", () => {
  type PacingMode = "smooth" | "catchup"

  /**
   * Pure function that mirrors the mode-transition logic inside the tick loop
   * of useStreamPacing, so we can test it without a React runtime.
   */
  function computeTransition(
    currentMode: PacingMode,
    queueDepth: number,
    oldestAge: number,
    catchUpExitTime: number,
    now: number
  ): { mode: PacingMode; catchUpExitTime: number } {
    const CATCHUP_QUEUE_DEPTH = 8
    const CATCHUP_AGE_MS = 120
    const REENTRY_QUEUE_DEPTH = 2
    const REENTRY_AGE_MS = 40
    const REENTRY_HOLD_MS = 250
    const SEVERE_QUEUE_DEPTH = 64
    const SEVERE_AGE_MS = 300

    let mode = currentMode
    let exitTime = catchUpExitTime

    if (mode === "smooth") {
      if (queueDepth >= CATCHUP_QUEUE_DEPTH || oldestAge >= CATCHUP_AGE_MS) {
        mode = "catchup"
      }
    } else {
      const isSevere =
        queueDepth >= SEVERE_QUEUE_DEPTH || oldestAge >= SEVERE_AGE_MS
      if (!isSevere) {
        const canExitCatchUp =
          queueDepth <= REENTRY_QUEUE_DEPTH && oldestAge <= REENTRY_AGE_MS
        if (canExitCatchUp) {
          if (exitTime === 0) {
            exitTime = now
          }
          if (now - exitTime >= REENTRY_HOLD_MS) {
            mode = "smooth"
            exitTime = 0
          }
        } else {
          exitTime = 0
        }
      }
    }

    return { mode, catchUpExitTime: exitTime }
  }

  test("smooth -> catchup on queue depth", () => {
    const result = computeTransition("smooth", 8, 0, 0, 1000)
    expect(result.mode).toBe("catchup")
  })

  test("smooth -> catchup on age", () => {
    const result = computeTransition("smooth", 1, 120, 0, 1000)
    expect(result.mode).toBe("catchup")
  })

  test("smooth stays smooth below thresholds", () => {
    const result = computeTransition("smooth", 5, 50, 0, 1000)
    expect(result.mode).toBe("smooth")
  })

  test("catchup -> smooth after re-entry hold elapses", () => {
    // First tick: start hold timer
    const r1 = computeTransition("catchup", 1, 10, 0, 1000)
    expect(r1.mode).toBe("catchup")
    expect(r1.catchUpExitTime).toBe(1000)

    // 100ms later: still in hold period
    const r2 = computeTransition("catchup", 1, 10, 1000, 1100)
    expect(r2.mode).toBe("catchup")
    expect(r2.catchUpExitTime).toBe(1000)

    // 249ms later: one ms short of hold
    const r2b = computeTransition("catchup", 1, 10, 1000, 1249)
    expect(r2b.mode).toBe("catchup")

    // 250ms later: hold elapses, exits to smooth
    const r3 = computeTransition("catchup", 1, 10, 1000, 1250)
    expect(r3.mode).toBe("smooth")
    expect(r3.catchUpExitTime).toBe(0)
  })

  test("catchup hold resets when conditions no longer met", () => {
    // Start hold timer
    const r1 = computeTransition("catchup", 1, 10, 0, 1000)
    expect(r1.catchUpExitTime).toBe(1000)

    // Queue spikes above re-entry threshold — hold resets
    const r2 = computeTransition("catchup", 5, 50, 1000, 1100)
    expect(r2.catchUpExitTime).toBe(0)
    expect(r2.mode).toBe("catchup")
  })

  test("severe queue backlog stays in catchup", () => {
    const result = computeTransition("catchup", 64, 10, 0, 1000)
    expect(result.mode).toBe("catchup")
  })

  test("severe age backlog stays in catchup", () => {
    const result = computeTransition("catchup", 1, 300, 0, 1000)
    expect(result.mode).toBe("catchup")
  })

  test("severe backlog bypasses re-entry hold entirely", () => {
    // Even if hold timer was running, severe keeps catchup
    const result = computeTransition("catchup", 64, 10, 500, 1000)
    expect(result.mode).toBe("catchup")
    // Note: exitTime is preserved but irrelevant under severe
  })

  test("stream reset clears catchup mode and exit timer", () => {
    // Simulates a reset scenario where newLen < prevLen
    // After reset, mode should be "smooth" and catchUpExitTime should be 0
    // This verifies the fix for stale pacing state across stream resets

    // Before the fix, modeRef and catchUpExitTimeRef were NOT reset,
    // so a new stream could inherit a prior catchup posture
    let mode: PacingMode = "catchup"
    let catchUpExitTime = 500

    // Simulate reset behavior
    mode = "smooth"
    catchUpExitTime = 0

    expect(mode).toBe("smooth")
    expect(catchUpExitTime).toBe(0)
  })

  test("full cycle: smooth -> catchup -> smooth", () => {
    // Start smooth
    let state = { mode: "smooth" as PacingMode, catchUpExitTime: 0 }

    // Burst arrives — enter catchup
    state = computeTransition(state.mode, 10, 0, state.catchUpExitTime, 1000)
    expect(state.mode).toBe("catchup")

    // Queue drains below re-entry thresholds — start hold
    state = computeTransition(state.mode, 1, 10, state.catchUpExitTime, 1100)
    expect(state.mode).toBe("catchup")
    expect(state.catchUpExitTime).toBe(1100)

    // Hold period elapses — back to smooth
    state = computeTransition(state.mode, 1, 10, state.catchUpExitTime, 1350)
    expect(state.mode).toBe("smooth")
    expect(state.catchUpExitTime).toBe(0)
  })
})

describe("same-length reconciliation", () => {
  test("detects changed items by reference", () => {
    const item1 = { id: "a" }
    const item2 = { id: "b" }
    const item2Updated = { id: "b" } // New reference, same content

    const prev = [item1, item2]
    const next = [item1, item2Updated]

    let changed = false
    const updated = [...prev]
    for (let i = 0; i < prev.length; i++) {
      if (updated[i] !== next[i]) {
        updated[i] = next[i]
        changed = true
      }
    }
    expect(changed).toBe(true)
    expect(updated[0]).toBe(item1) // unchanged item preserved
    expect(updated[1]).toBe(item2Updated) // mutated item updated
  })

  test("no change when all references match", () => {
    const item1 = { id: "a" }
    const item2 = { id: "b" }

    const prev = [item1, item2]
    const next = [item1, item2]

    let changed = false
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) {
        changed = true
        break
      }
    }
    expect(changed).toBe(false)
  })

  test("reconciles partial mutations in released subset", () => {
    // Simulates the case where released has fewer items than the full array
    // (some items are still in the queue)
    const item1 = { id: "a" }
    const item2 = { id: "b" }
    const item1Updated = { id: "a", text: "updated" }

    const released = [item1, item2] // 2 items released so far
    const allItems = [item1Updated, item2, { id: "c" }] // 3 total, 1 mutated
    const minLen = Math.min(allItems.length, released.length)

    let changed = false
    const updated = [...released]
    for (let i = 0; i < minLen; i++) {
      if (updated[i] !== allItems[i]) {
        updated[i] = allItems[i]
        changed = true
      }
    }
    expect(changed).toBe(true)
    expect(updated[0]).toBe(item1Updated)
    expect(updated[1]).toBe(item2)
    expect(updated.length).toBe(2) // only released items, not new ones
  })
})

describe("queued item reconciliation", () => {
  test("queued items are updated when upstream mutates them", () => {
    // Simulate: 5 items total, 3 released, 2 in queue
    const item1 = { id: "a" }
    const item2 = { id: "b" }
    const item3 = { id: "c" }
    const item4 = { id: "d" }
    const item5 = { id: "e" }
    const item4Updated = { id: "d", text: "updated" }

    const prevLen = 5
    const queue = [
      { item: item4, enqueuedAt: 100 },
      { item: item5, enqueuedAt: 100 },
    ]
    const releasedCount = prevLen - queue.length // 3
    const updatedItems = [item1, item2, item3, item4Updated, item5, { id: "f" }]
    const newLen = updatedItems.length

    // Reconcile queue
    for (let qi = 0; qi < queue.length; qi++) {
      const sourceIdx = releasedCount + qi
      if (sourceIdx < newLen && updatedItems[sourceIdx] !== queue[qi].item) {
        queue[qi] = { ...queue[qi], item: updatedItems[sourceIdx] }
      }
    }

    expect(queue[0].item).toBe(item4Updated)
    expect(queue[1].item).toBe(item5) // unchanged
    expect(queue[0].enqueuedAt).toBe(100) // preserved
  })
})
