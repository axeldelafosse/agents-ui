"use client"

import { parsePatchFiles } from "@pierre/diffs"
import type { FileDiffMetadata } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import { useMemo } from "react"

/**
 * If a patch starts with a hunk header but has no file headers,
 * prepend synthetic `--- a/file` / `+++ b/file` lines so
 * parsePatchFiles can handle it.
 */
function normalizePatch(raw: string): string {
  const trimmed = raw.trimStart()
  if (trimmed.startsWith("@@") || trimmed.startsWith("diff ")) {
    if (!trimmed.includes("--- ")) {
      return `--- a/file\n+++ b/file\n${trimmed}`
    }
  }
  return raw
}

function tryParse(patch: string): FileDiffMetadata[] | null {
  try {
    const parsed = parsePatchFiles(patch)
    const files = parsed.flatMap((fileSet) => fileSet.files)
    return files.length > 0 ? files : null
  } catch {
    return null
  }
}

export function DiffView({ patch }: { patch: string }) {
  const fileDiffs = useMemo(() => {
    return tryParse(patch) ?? tryParse(normalizePatch(patch))
  }, [patch])

  if (!fileDiffs || fileDiffs.length === 0) {
    return (
      <pre className="max-h-96 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
        {patch}
      </pre>
    )
  }

  return (
    <div className="space-y-2">
      {fileDiffs.map((fileDiff, index) => (
        <div
          className="max-h-96 overflow-auto rounded-md border border-zinc-800"
          key={fileDiff.name ?? index}
        >
          <FileDiff
            fileDiff={fileDiff}
            options={{ theme: "pierre-dark", diffStyle: "unified" }}
          />
        </div>
      ))}
    </div>
  )
}
