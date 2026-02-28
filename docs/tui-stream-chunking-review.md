# Stream Compaction — Acceptance Checklist

Verification gate for the 5-phase stream compaction pipeline.
All items must pass before merge.

Last verified: 2026-02-27

## Build & Tests

- [x] `bun run build` succeeds
- [x] `bun test` in `packages/ui/` passes (0 failures)
- [x] No stale test files under `lib/` or `components/` (verified: these dirs contain app-level code, not stale test artifacts)

## Phase 1: Exploring Groups Absorb Paired Results

- [x] An exploring `tool_call` followed by its matching `tool_result` ends up in the same `CompactExploringGroup`
- [x] A `tool_result` whose `callId` does NOT match any pending exploring call breaks the group (emitted as orphan single)
- [x] Multiple exploring calls with interleaved results are all absorbed into one group
- [x] `pendingCallIds` is cleared after first match — duplicate `tool_result` for the same `callId` is NOT absorbed twice

## Phase 2: Smarter Exploring Group Boundaries

- [x] `thinking` between exploring items does not break the group (deferred as single after group)
- [x] `reasoning` between exploring items does not break the group
- [x] Assistant `message` (role=assistant) between exploring items does not break the group
- [x] User `message` (role=user) between exploring items DOES break the group
- [x] Message with no/unknown role between exploring items DOES break the group
- [x] Non-exploring `tool_call` (e.g. Bash) between exploring items breaks the group
- [x] Mixed transparent items (thinking + message + reasoning) between exploring items still produce one group

## Phase 3: Newline-Gated Text Streaming

- [x] While streaming, text is returned up to (and including) the last `\n`
- [x] While streaming with no newlines, `undefined` is returned
- [x] When not streaming, full text is returned regardless of newlines
- [x] `Message` component shows shimmer placeholder when gated text is undefined during streaming
- [x] `MessageBlock` component shows shimmer placeholder when gated text is undefined during streaming

## Phase 4: Shimmer Header Coverage

- [x] `StreamExploringGroup` uses `<Shimmer>` for the "Exploring..." label when streaming
- [x] `StreamToolPair` uses `<Shimmer>` for the "Running..." label when streaming
- [x] Completed state shows static labels (no shimmer)

## Phase 5: Auto-Expand/Collapse

- [x] `StreamExploringGroup` auto-collapses when status transitions from streaming to complete
- [x] `StreamToolPair` auto-collapses when status transitions from streaming to complete
- [x] User can manually toggle expand/collapse after auto-collapse
- [x] Both components auto-open when streaming resumes on the same React key (Finding 1 fix)

## Phase 6: Output Preview Tuning

- [x] Collapsed tool pair shows max 3 lines with middle-out truncation
- [x] No dead config constants (`TOOL_CALL_MAX_LINES`, `USER_SHELL_MAX_LINES` removed)
- [x] Expanded view uses line-budgeted preview (50 shell / 20 default) with "Show all" toggle
- [x] Per-line char cap (200 chars) prevents long single-line outputs from overflowing preview

## Review Fixes

- [x] **Finding 1 (High)**: Unscoped transparent items no longer bypass scope guard — strict scope match required
- [x] **Finding 2 (Medium)**: Newline gating applied consistently to both user and assistant messages
- [x] **Finding 3 (Medium)**: Expanded view uses line-budgeted preview with "Show all" toggle
- [x] **Finding 4 (Low)**: callId alias coverage tests added (`call_id`, `toolCallId`, `tool_use_id`, mixed); fixture 4 tightened with exact shape assertions

## Regression Fixtures

Representative stream sequences verified via `compact-stream-items.test.ts`:

1. [x] **Explore burst**: 5+ consecutive Read/Grep/Glob calls from same agent (fixture 1)
2. [x] **Delayed tool results**: tool_call → thinking → tool_result (result absorbed into group) (fixture 2)
3. [x] **Thinking interleaving**: exploring → thinking → exploring (one group, thinking deferred into thinking-block) (fixture 3)
4. [x] **Streaming messages**: partial text with no newlines → shimmer → first newline → text appears (covered by `use-newline-gated-text.test.ts`)
5. [x] **Scope boundary**: exploring calls from agent-1 and agent-2 never merge (fixture 5)
6. [x] **Non-exploring break**: exploring → Bash tool_call → exploring (two separate groups) (fixture 6)
7. [x] **Full pipeline**: user msg → exploring group → tool pair → assistant message → turn_complete filtered (fixture 7)
