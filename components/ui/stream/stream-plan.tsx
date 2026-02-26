import { asRecord, getArray, getMarkdown, getString } from "./stream-data"
import { StreamMarkdown } from "./stream-markdown"
import type { StreamItem } from "./stream-types"

interface StreamPlanProps {
  item: StreamItem
}

const getStepText = (step: unknown, index: number): string => {
  if (typeof step === "string") {
    return step
  }

  const record = asRecord(step)
  return (
    getString(record, ["step", "text", "title", "description", "content"]) ??
    `Step ${index + 1}`
  )
}

const getStepState = (step: unknown): string | undefined => {
  const record = asRecord(step)
  return getString(record, ["status", "state", "phase"])
}

const getStepKey = (step: unknown, index: number): string => {
  const record = asRecord(step)
  const key = getString(record, ["id", "step", "text", "title"])
  return key ? `${index}-${key}` : `step-${index}`
}

export function StreamPlan({ item }: StreamPlanProps) {
  const summary = getMarkdown(item.data, [
    "summary",
    "text",
    "content",
    "message",
  ])
  const steps = getArray(item.data, ["steps", "items", "plan"])

  return (
    <div className="my-1 border-zinc-800 border-l-2 pl-3 text-sm">
      <p className="mb-1 font-medium text-xs text-zinc-500 uppercase tracking-wide">
        Plan
      </p>
      {summary && (
        <div className="text-zinc-300">
          <StreamMarkdown text={summary} />
        </div>
      )}
      {steps.length > 0 ? (
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-zinc-300">
          {steps.map((step, stepIndex) => {
            const state = getStepState(step)
            const text = getStepText(step, stepIndex)

            return (
              <li key={getStepKey(step, stepIndex)}>
                <span>{text}</span>
                {state && (
                  <span className="ml-2 text-xs text-zinc-500">({state})</span>
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        !summary && (
          <p className="text-xs text-zinc-500 italic">No explicit steps yet.</p>
        )
      )}
    </div>
  )
}
