"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Adaptive 2-gear stream pacing hook.
 *
 * Prevents UI jank on bursty streams by smoothing the rate at which new
 * items are released to the renderer.
 *
 * Modes:
 * - **Smooth**: release 1 new item per tick (~8.3ms at 120fps)
 * - **CatchUp**: drain entire buffer when queue depth or age exceeds thresholds
 *
 * Transition rules:
 * - Enter CatchUp when `queue >= CATCHUP_QUEUE_DEPTH` or `oldest >= CATCHUP_AGE_MS`
 * - Exit CatchUp (back to Smooth) only after queue remains below
 *   `REENTRY_QUEUE_DEPTH` and `REENTRY_AGE_MS` for `REENTRY_HOLD_MS`
 * - Severe backlog (`queue >= SEVERE_QUEUE_DEPTH` or `oldest >= SEVERE_AGE_MS`)
 *   bypasses re-entry hold, forcing faster convergence
 */

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Enter CatchUp when this many items are queued. */
const CATCHUP_QUEUE_DEPTH = 8
/** Enter CatchUp when the oldest queued item is this old (ms). */
const CATCHUP_AGE_MS = 120
/** Queue depth below which re-entry to Smooth is allowed. */
const REENTRY_QUEUE_DEPTH = 2
/** Item age below which re-entry to Smooth is allowed. */
const REENTRY_AGE_MS = 40
/** Hold duration before allowing re-entry to Smooth (ms). */
const REENTRY_HOLD_MS = 250
/** Severe backlog depth - forces immediate CatchUp drain. */
const SEVERE_QUEUE_DEPTH = 64
/** Severe backlog age (ms) - forces immediate CatchUp drain. */
const SEVERE_AGE_MS = 300

type PacingMode = "smooth" | "catchup"

interface QueueEntry<T> {
  item: T
  enqueuedAt: number
}

export function useStreamPacing<T>(items: readonly T[]): readonly T[] {
  const [released, setReleased] = useState<readonly T[]>([])
  const queueRef = useRef<QueueEntry<T>[]>([])
  const modeRef = useRef<PacingMode>("smooth")
  const catchUpExitTimeRef = useRef<number>(0)
  const prevLengthRef = useRef(0)
  const rafRef = useRef<number>(0)

  // Enqueue new items when the input array grows, and reconcile mutations
  useEffect(() => {
    const prevLen = prevLengthRef.current
    const newLen = items.length

    if (newLen > prevLen) {
      // Reconcile already-released items that may have mutated
      setReleased((prev) => {
        let changed = false
        const updated = [...prev]
        for (let i = 0; i < Math.min(prevLen, updated.length); i++) {
          if (updated[i] !== items[i]) {
            updated[i] = items[i]
            changed = true
          }
        }
        return changed ? updated : prev
      })
      // Reconcile queued items that may have mutated upstream
      const releasedCount = prevLen - queueRef.current.length
      for (let qi = 0; qi < queueRef.current.length; qi++) {
        const sourceIdx = releasedCount + qi
        if (sourceIdx < newLen && items[sourceIdx] !== queueRef.current[qi].item) {
          queueRef.current[qi] = { ...queueRef.current[qi], item: items[sourceIdx] }
        }
      }
      // Enqueue genuinely new items
      const now = performance.now()
      for (let i = prevLen; i < newLen; i++) {
        queueRef.current.push({ item: items[i], enqueuedAt: now })
      }
    } else if (newLen < prevLen) {
      // Items were removed (e.g. reset) — flush everything and reset pacing state
      queueRef.current = []
      modeRef.current = "smooth"
      catchUpExitTimeRef.current = 0
      setReleased(items)
    } else {
      // Same length — reconcile in-place mutations on released items
      setReleased((prev) => {
        let changed = false
        const updated = [...prev]
        for (let i = 0; i < Math.min(newLen, updated.length); i++) {
          if (updated[i] !== items[i]) {
            updated[i] = items[i]
            changed = true
          }
        }
        return changed ? updated : prev
      })
      // Reconcile queued items that may have mutated upstream
      const releasedCount = prevLen - queueRef.current.length
      for (let qi = 0; qi < queueRef.current.length; qi++) {
        const sourceIdx = releasedCount + qi
        if (sourceIdx < newLen && items[sourceIdx] !== queueRef.current[qi].item) {
          queueRef.current[qi] = { ...queueRef.current[qi], item: items[sourceIdx] }
        }
      }
    }

    prevLengthRef.current = newLen
  }, [items])

  // Tick loop: drain queue according to pacing mode
  useEffect(() => {
    let running = true

    const tick = () => {
      if (!running) {
        return
      }

      const queue = queueRef.current
      if (queue.length === 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const now = performance.now()
      const oldestAge = now - queue[0].enqueuedAt
      const queueDepth = queue.length

      // Determine mode transitions
      if (modeRef.current === "smooth") {
        const shouldCatchUp =
          queueDepth >= CATCHUP_QUEUE_DEPTH || oldestAge >= CATCHUP_AGE_MS
        if (shouldCatchUp) {
          modeRef.current = "catchup"
        }
      } else {
        // In CatchUp mode — check for exit conditions
        const isSevere =
          queueDepth >= SEVERE_QUEUE_DEPTH || oldestAge >= SEVERE_AGE_MS
        if (!isSevere) {
          const canExitCatchUp =
            queueDepth <= REENTRY_QUEUE_DEPTH && oldestAge <= REENTRY_AGE_MS
          if (canExitCatchUp) {
            if (catchUpExitTimeRef.current === 0) {
              catchUpExitTimeRef.current = now
            }
            if (now - catchUpExitTimeRef.current >= REENTRY_HOLD_MS) {
              modeRef.current = "smooth"
              catchUpExitTimeRef.current = 0
            }
          } else {
            catchUpExitTimeRef.current = 0
          }
        }
      }

      // Drain based on current mode
      let drainCount: number
      if (modeRef.current === "catchup") {
        // Drain all
        drainCount = queue.length
      } else {
        // Smooth: release 1 per tick
        drainCount = 1
      }

      const drained = queue.splice(0, drainCount)
      if (drained.length > 0) {
        setReleased((prev) => {
          const next = [...prev]
          for (const entry of drained) {
            next.push(entry.item)
          }
          return next
        })
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return released
}
