"use client"

import Link from "next/link"
import { useCallback } from "react"
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

export default function Page() {
  const {
    activeAgent,
    activeHost,
    activeOutput,
    activeStreamItems,
    activeTab,
    autoFollow,
    captureEnabled,
    handleApprovalInput,
    handleApprovalResponse,
    saveCaptureSnapshot,
    startCapture,
    stopCaptureAndSave,
    setAutoFollow,
    setSelectedTabId,
    visibleTabs,
  } = useAgentsRuntime()

  const onApprove = useCallback(
    (item: StreamItem) => handleApprovalResponse(item, true),
    [handleApprovalResponse]
  )

  const onDeny = useCallback(
    (item: StreamItem) => handleApprovalResponse(item, false),
    [handleApprovalResponse]
  )

  const onSubmitInput = useCallback(
    (item: StreamItem, value: StreamApprovalInputValue) =>
      handleApprovalInput(item, value),
    [handleApprovalInput]
  )

  const hasStreamItems = activeStreamItems.length > 0

  return (
    <main>
      <div className="flex items-center justify-between p-4">
        <div>
          <p className="text-nowrap font-bold text-lg tracking-tight">
            Agents UI
          </p>
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
            onAutoFollowChange={setAutoFollow}
            onTabChange={setSelectedTabId}
            tabs={visibleTabs}
          />
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
          {hasStreamItems && (
            <StreamFeed
              items={activeStreamItems}
              onApprove={onApprove}
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
