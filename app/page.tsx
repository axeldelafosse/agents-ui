"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import { Streamdown } from "streamdown"
import { DEBUG_MODE } from "@/app/features/agents/constants"
import { useAgentsRuntime } from "@/app/features/agents/hooks/use-agents-runtime"
import { AgentTabBar } from "@/components/agent-tab-bar"
import { Shimmer } from "@/components/ui/shimmer"
import { StreamFeed } from "@/components/ui/stream/stream-feed"
import type {
  StreamApprovalInputValue,
  StreamItem,
} from "@/components/ui/stream/stream-types"
import { ThreadBrowser } from "@/components/ui/thread-browser"

export default function Page() {
  const {
    activeAgent,
    activeHost,
    activeOutput,
    activeStreamItems,
    activeTab,
    agents,
    archiveCodexThread,
    autoFollow,
    captureEnabled,
    forkCodexThread,
    handleApprovalDecision,
    handleApprovalInput,
    handleApprovalResponse,
    interruptCodexTurn,
    listCodexThreads,
    resumeCodexThread,
    saveCaptureSnapshot,
    setAutoFollow,
    setCodexThreadName,
    setSelectedTabId,
    startCapture,
    steerCodexTurn,
    stopCaptureAndSave,
    threadListResult,
    visibleTabs,
  } = useAgentsRuntime()

  const [threadBrowserOpen, setThreadBrowserOpen] = useState(false)

  const codexHubUrl = agents.find((a) => a.protocol === "codex")?.url

  const openThreadBrowser = useCallback(() => {
    if (codexHubUrl) {
      listCodexThreads(codexHubUrl)
    }
    setThreadBrowserOpen(true)
  }, [codexHubUrl, listCodexThreads])

  const closeThreadBrowser = useCallback(() => {
    setThreadBrowserOpen(false)
  }, [])

  const onApprove = useCallback(
    (item: StreamItem) => handleApprovalResponse(item, true),
    [handleApprovalResponse]
  )

  const onDeny = useCallback(
    (item: StreamItem) => handleApprovalResponse(item, false),
    [handleApprovalResponse]
  )

  const onApproveForSession = useCallback(
    (item: StreamItem) => handleApprovalDecision(item, "acceptForSession"),
    [handleApprovalDecision]
  )

  const onSubmitInput = useCallback(
    (item: StreamItem, value: StreamApprovalInputValue) =>
      handleApprovalInput(item, value),
    [handleApprovalInput]
  )

  const hasStreamItems = activeStreamItems.length > 0
  const showThreadBrowser = threadBrowserOpen && codexHubUrl

  return (
    <main>
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <p className="text-nowrap font-bold text-lg tracking-tight">
            Agents UI
          </p>
          {codexHubUrl && !threadBrowserOpen && (
            <button
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800"
              onClick={openThreadBrowser}
              type="button"
            >
              Browse Threads
            </button>
          )}
        </div>
        {DEBUG_MODE && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="ml-2 text-right text-zinc-400">
              {activeAgent
                ? `${activeAgent.protocol} @ ${activeHost} (${activeAgent.status})`
                : ""}
            </p>
            <button
              className={
                captureEnabled
                  ? "rounded-md border border-red-700 bg-red-950/40 px-2.5 py-1.5 text-red-100 text-xs"
                  : "rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
              }
              onClick={captureEnabled ? stopCaptureAndSave : startCapture}
              type="button"
            >
              {captureEnabled ? "Stop + save capture" : "Record next chat"}
            </button>
            <button
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
              onClick={saveCaptureSnapshot}
              type="button"
            >
              Save snapshot
            </button>
            <Link
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
              href="/playground"
            >
              Open playground
            </Link>
          </div>
        )}
      </div>
      <div>
        {visibleTabs.length > 0 && activeTab && (
          <AgentTabBar
            activeTabId={activeTab.id}
            autoFollow={autoFollow}
            onArchiveThread={archiveCodexThread}
            onAutoFollowChange={setAutoFollow}
            onForkThread={forkCodexThread}
            onRenameThread={setCodexThreadName}
            onTabChange={setSelectedTabId}
            tabs={visibleTabs}
          />
        )}
        {showThreadBrowser && (
          <div className="mx-auto max-w-3xl px-4 pt-4">
            <ThreadBrowser
              hubUrl={codexHubUrl}
              listCodexThreads={listCodexThreads}
              onClose={closeThreadBrowser}
              resumeCodexThread={resumeCodexThread}
              threadListResult={threadListResult}
            />
          </div>
        )}
        <div className="mx-auto max-w-3xl bg-zinc-950 p-4">
          {!activeAgent && (
            <Shimmer className="text-sm" duration={2}>
              Looking for background agents
            </Shimmer>
          )}
          {activeAgent && !hasStreamItems && !activeOutput && (
            <Shimmer className="text-sm" duration={2}>
              Thinking
            </Shimmer>
          )}
          {activeAgent?.protocol === "codex" &&
            activeAgent.threadStatus === "active" && (
              <div className="mb-3 flex items-center gap-2">
                <form
                  className="flex min-w-0 flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const input = new FormData(e.currentTarget).get(
                      "steerInput"
                    )
                    if (typeof input === "string" && input.trim()) {
                      steerCodexTurn(activeAgent.id, input.trim())
                      e.currentTarget.reset()
                    }
                  }}
                >
                  <input
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500"
                    name="steerInput"
                    placeholder="Steer this turn..."
                    type="text"
                  />
                  <button
                    className="rounded-md border border-blue-700/60 bg-blue-900/30 px-3 py-1.5 text-blue-100 text-sm"
                    type="submit"
                  >
                    Steer
                  </button>
                </form>
                <button
                  className="rounded-md border border-red-700/60 bg-red-900/30 px-3 py-1.5 text-red-100 text-sm"
                  onClick={() => interruptCodexTurn(activeAgent.id)}
                  type="button"
                >
                  Stop
                </button>
              </div>
            )}
          {hasStreamItems && (
            <StreamFeed
              items={activeStreamItems}
              onApprove={onApprove}
              onApproveForSession={onApproveForSession}
              onDeny={onDeny}
              onSubmitInput={onSubmitInput}
            />
          )}
          {!hasStreamItems && activeOutput && (
            <Streamdown className="text-sm leading-relaxed">
              {activeOutput}
            </Streamdown>
          )}
        </div>
      </div>
    </main>
  )
}
