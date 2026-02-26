"use client"

import type { MutableRefObject } from "react"
import type { CodexThreadListResult } from "@/app/features/agents/hooks/use-codex-runtime"
import { shortId } from "@/app/features/agents/tab-utils"

interface ThreadBrowserProps {
  hubUrl: string
  listCodexThreads: (hubUrl: string, cursor?: string) => void
  onClose: () => void
  resumeCodexThread: (hubUrl: string, threadId: string) => void
  threadListResult: MutableRefObject<CodexThreadListResult>
}

function formatTimestamp(unixSeconds: number): string {
  if (!unixSeconds) {
    return ""
  }
  const date = new Date(unixSeconds * 1000)
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ThreadBrowser({
  hubUrl,
  listCodexThreads,
  onClose,
  resumeCodexThread,
  threadListResult,
}: ThreadBrowserProps) {
  const result = threadListResult.current
  const threads = result.data
  const hasMore = result.nextCursor !== null

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium text-sm text-zinc-200">Persisted Threads</h3>
        <button
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>

      {threads.length === 0 && (
        <p className="text-sm text-zinc-500">No threads found.</p>
      )}

      {threads.length > 0 && (
        <ul className="space-y-1">
          {threads.map((thread) => (
            <li
              className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2"
              key={thread.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-300">
                  {thread.preview || shortId(thread.id)}
                </p>
                <p className="text-xs text-zinc-500">
                  {shortId(thread.id)}
                  {thread.updatedAt
                    ? ` \u00b7 ${formatTimestamp(thread.updatedAt)}`
                    : ""}
                </p>
              </div>
              <button
                className="ml-3 shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                onClick={() => resumeCodexThread(hubUrl, thread.id)}
                type="button"
              >
                Resume
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          className="mt-3 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          onClick={() =>
            listCodexThreads(hubUrl, result.nextCursor ?? undefined)
          }
          type="button"
        >
          Load more
        </button>
      )}
    </div>
  )
}
