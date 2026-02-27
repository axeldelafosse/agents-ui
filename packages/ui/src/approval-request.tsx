import type { FormEvent } from "react"
import {
  asRecord,
  getArray,
  getBoolean,
  getMarkdown,
  getString,
  getValue,
} from "./data"
import { ItemShell } from "./item-shell"
import { Markdown } from "./markdown"
import type {
  StreamApprovalCallbacks,
  StreamApprovalInputValue,
  StreamItem,
} from "./types"

const INPUT_TYPE_PATTERN = /input/i
const CODEX_USER_INPUT_METHOD = "item/tool/requestUserInput"

interface ApprovalQuestionOption {
  description?: string
  label: string
}

interface ApprovalQuestion {
  header?: string
  id: string
  isSecret: boolean
  options: ApprovalQuestionOption[]
  question?: string
}

function parseApprovalQuestionOptions(
  rawQuestion: unknown
): ApprovalQuestionOption[] {
  const question = asRecord(rawQuestion)
  if (!question) {
    return []
  }
  const rawOptions = getArray(question, ["options", "choices"])
  const options: ApprovalQuestionOption[] = []
  for (const rawOption of rawOptions) {
    if (typeof rawOption === "string") {
      const label = rawOption.trim()
      if (label) {
        options.push({ label })
      }
      continue
    }

    const option = asRecord(rawOption)
    const label = getString(option, ["label", "value", "title"])
    if (!label) {
      continue
    }
    options.push({
      description: getString(option, ["description", "helpText"]),
      label,
    })
  }
  return options
}

function parseApprovalQuestions(item: StreamItem): ApprovalQuestion[] {
  const params = asRecord(getValue(item.data, ["params", "requestParams"]))
  const directQuestions = getArray(item.data, ["questions"])
  const nestedQuestions = getArray(params, ["questions"])
  const source = directQuestions.length > 0 ? directQuestions : nestedQuestions
  const questions: ApprovalQuestion[] = []
  for (const rawQuestion of source) {
    const question = asRecord(rawQuestion)
    const id = getString(question, ["id", "questionId", "key"])
    if (!id) {
      continue
    }
    questions.push({
      header: getString(question, ["header", "title", "label"]),
      id,
      isSecret:
        getBoolean(question, ["isSecret", "secret", "is_secret"]) ?? false,
      options: parseApprovalQuestionOptions(question),
      question: getString(question, [
        "question",
        "prompt",
        "text",
        "description",
      ]),
    })
  }
  return questions
}

function submitStructuredAnswers(
  formData: FormData,
  questions: readonly ApprovalQuestion[]
): StreamApprovalInputValue | undefined {
  if (questions.length === 0) {
    const rawValue = formData.get("approvalInput")
    if (typeof rawValue !== "string") {
      return undefined
    }
    const value = rawValue.trim()
    return value.length > 0 ? value : undefined
  }

  const answers: Record<string, string> = {}
  for (const question of questions) {
    const rawValue = formData.get(`question:${question.id}`)
    if (typeof rawValue !== "string") {
      continue
    }
    const value = rawValue.trim()
    if (!value) {
      continue
    }
    answers[question.id] = value
  }
  return Object.keys(answers).length > 0 ? answers : undefined
}

interface ApprovalRequestProps extends StreamApprovalCallbacks {
  item: StreamItem
}

export function ApprovalRequest({
  item,
  onApprove,
  onApproveForSession,
  onDeny,
  onSubmitInput,
}: ApprovalRequestProps) {
  const requestMethod = getString(item.data, [
    "requestMethod",
    "request_method",
    "method",
  ])
  const requestType =
    getString(item.data, [
      "requestType",
      "kind",
      "subtype",
      "mode",
      "type",
      "requestMethod",
    ]) ??
    requestMethod ??
    "approval"
  const title = getString(item.data, ["title", "requestTitle"]) ?? "Approval"
  const params = asRecord(getValue(item.data, ["params", "requestParams"]))
  const request = asRecord(getValue(item.data, ["request"]))
  const requestInput = asRecord(getValue(request, ["input"]))
  const toolName =
    getString(item.data, ["toolName", "tool", "name"]) ??
    getString(request, ["tool_name", "toolName", "tool"])
  const questions = parseApprovalQuestions(item)
  const isCodexUserInputRequest = requestMethod === CODEX_USER_INPUT_METHOD
  const prompt =
    getMarkdown(item.data, [
      "prompt",
      "text",
      "title",
      "message",
      "description",
      "summary",
    ]) ??
    getMarkdown(params, ["prompt", "message", "reason", "description"]) ??
    getMarkdown(request, ["prompt", "message", "reason", "description"]) ??
    (toolName ? `Allow tool \`${toolName}\`?` : undefined)
  const command =
    getString(item.data, ["command", "proposedCommand", "cmd"]) ??
    getString(params, ["command", "proposedCommand", "cmd"]) ??
    getString(requestInput, ["command", "cmd"])
  const filePath =
    getString(item.data, ["path", "filePath", "targetPath"]) ??
    getString(params, ["path", "filePath", "targetPath", "grantRoot"]) ??
    getString(requestInput, ["path", "filePath", "targetPath", "file_path"])
  const placeholder =
    getString(item.data, ["inputPlaceholder", "placeholder"]) ??
    getString(params, ["inputPlaceholder", "placeholder"]) ??
    "Type a response"

  const requiresInputHint =
    getBoolean(item.data, ["requiresInput", "needsInput", "expectInput"]) ??
    getBoolean(params, ["requiresInput", "needsInput", "expectInput"]) ??
    INPUT_TYPE_PATTERN.test(requestType)

  const requiresInput =
    isCodexUserInputRequest || questions.length > 0 || requiresInputHint

  const inputId = `approval-input-${item.id}`

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onSubmitInput) {
      return
    }

    const formData = new FormData(event.currentTarget)
    const value = submitStructuredAnswers(formData, questions)
    if (!value) {
      return
    }

    onSubmitInput(item, value)
    event.currentTarget.reset()
  }

  return (
    <ItemShell item={item} label={title}>
      {prompt ? (
        <Markdown text={prompt} />
      ) : (
        <p className="text-zinc-200">
          {toolName
            ? `This ${toolName} action needs approval.`
            : "This action needs approval."}
        </p>
      )}
      {command && (
        <p className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2 font-mono text-xs text-zinc-200">
          {command}
        </p>
      )}
      {filePath && (
        <p className="mt-2 font-mono text-xs text-zinc-300">
          Target: {filePath}
        </p>
      )}
      <p className="text-xs text-zinc-400">
        Type:{" "}
        <span className="rounded bg-amber-900/35 px-1.5 py-0.5 text-amber-100 normal-case">
          {requestType}
        </span>
      </p>
      {requiresInput && (
        <form className="mt-3 flex flex-col gap-2" onSubmit={handleSubmit}>
          {questions.length > 0 ? (
            questions.map((question) => {
              const fieldId = `${inputId}-${question.id}`
              const datalistId = `${fieldId}-options`
              const label = question.header ?? question.question ?? question.id
              const questionHintId =
                question.question && question.question !== label
                  ? `${fieldId}-hint`
                  : undefined
              const optionHintId =
                question.options.length > 0
                  ? `${fieldId}-options-hint`
                  : undefined
              const describedBy = [questionHintId, optionHintId]
                .filter(Boolean)
                .join(" ")
              return (
                <div className="flex flex-col gap-1" key={question.id}>
                  <label className="text-xs text-zinc-300" htmlFor={fieldId}>
                    {label}
                  </label>
                  {question.question && question.question !== label && (
                    <p className="text-xs text-zinc-500" id={questionHintId}>
                      {question.question}
                    </p>
                  )}
                  <input
                    aria-describedby={describedBy || undefined}
                    autoComplete={
                      question.isSecret ? "current-password" : "off"
                    }
                    className="min-w-52 flex-1 rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
                    id={fieldId}
                    list={question.options.length > 0 ? datalistId : undefined}
                    name={`question:${question.id}`}
                    placeholder={placeholder}
                    type={question.isSecret ? "password" : "text"}
                  />
                  {question.options.length > 0 && (
                    <>
                      <datalist id={datalistId}>
                        {question.options.map((option) => (
                          <option key={option.label} value={option.label} />
                        ))}
                      </datalist>
                      <p
                        className="text-[11px] text-zinc-500"
                        id={optionHintId}
                      >
                        Options:{" "}
                        {question.options
                          .map((option) =>
                            option.description
                              ? `${option.label} (${option.description})`
                              : option.label
                          )
                          .join(", ")}
                      </p>
                    </>
                  )}
                </div>
              )
            })
          ) : (
            <>
              <label className="text-xs text-zinc-300" htmlFor={inputId}>
                Provide input
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  autoComplete="off"
                  className="min-w-52 flex-1 rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
                  id={inputId}
                  name="approvalInput"
                  placeholder={placeholder}
                  type="text"
                />
              </div>
            </>
          )}
          <button
            className="w-fit rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!onSubmitInput}
            type="submit"
          >
            {questions.length > 1 ? "Submit responses" : "Submit input"}
          </button>
        </form>
      )}
      {!isCodexUserInputRequest && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="rounded-md border border-emerald-700/60 bg-emerald-900/30 px-3 py-1.5 text-emerald-100 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!onApprove}
            onClick={() => onApprove?.(item)}
            type="button"
          >
            Approve
          </button>
          {onApproveForSession && (
            <button
              className="rounded-md border border-teal-700/60 bg-teal-900/30 px-3 py-1.5 text-sm text-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70"
              onClick={() => onApproveForSession(item)}
              type="button"
            >
              Accept for session
            </button>
          )}
          <button
            className="rounded-md border border-red-700/60 bg-red-900/25 px-3 py-1.5 text-red-100 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!onDeny}
            onClick={() => onDeny?.(item)}
            type="button"
          >
            Deny
          </button>
        </div>
      )}
    </ItemShell>
  )
}
