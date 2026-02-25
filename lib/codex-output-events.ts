import {
  type CodexRpcParams,
  codexCommandFromParams,
  codexExitCodeFromParams,
  codexStatusFromParams,
} from "@/lib/codex-rpc"
import type { CodexOutputEvent } from "@/lib/stream-output"
import {
  codexTextFromParams,
  codexTextFromRawParams,
} from "@/lib/stream-parsing"

interface CodexOutputProjectionInput {
  method?: string
  params?: CodexRpcParams
  threadId?: string
}

interface MissingTextDebugInfo {
  keys: string
  method: string
  msgKeys: string
  msgType: string
}

export interface CodexOutputProjection {
  events: CodexOutputEvent[]
  missingText?: MissingTextDebugInfo
}

function debugInfoForMissingText(
  method: string,
  params?: CodexRpcParams
): MissingTextDebugInfo {
  const rawMsg = params?.msg
  const msgType = Array.isArray(rawMsg) ? "array" : typeof rawMsg
  const msgKeys =
    msgType === "object" && rawMsg
      ? Object.keys(rawMsg as Record<string, unknown>).join(",") || "-"
      : "-"
  return {
    keys: Object.keys(params ?? {}).join(",") || "-",
    method,
    msgKeys,
    msgType,
  }
}

function toReadableDeltaText(text: string): string {
  if (!text) {
    return ""
  }
  return text.endsWith("\n") ? text : `${text}\n`
}

function projectToolBegin(
  params: CodexRpcParams | undefined,
  threadId: string | undefined
): CodexOutputProjection {
  const command = codexCommandFromParams(params) ?? "(command unavailable)"
  return {
    events: [
      {
        method: "item/agentMessage/delta",
        text: `\n[tool] \`$ ${command}\`\n`,
        threadId,
      },
    ],
  }
}

function projectToolOutputDelta(
  method: string,
  params: CodexRpcParams | undefined,
  threadId: string | undefined
): CodexOutputProjection {
  const text = codexTextFromParams(params)
  return {
    events: [
      {
        method: "item/agentMessage/delta",
        text: toReadableDeltaText(text),
        threadId,
      },
    ],
    missingText: text ? undefined : debugInfoForMissingText(method, params),
  }
}

function projectToolEnd(
  params: CodexRpcParams | undefined,
  threadId: string | undefined
): CodexOutputProjection {
  const status = codexStatusFromParams(params)
  const exitCode = codexExitCodeFromParams(params)
  const statusText = status ? ` ${status}` : ""
  const exitText = typeof exitCode === "number" ? ` (exit ${exitCode})` : ""
  return {
    events: [
      {
        method: "item/agentMessage/delta",
        text: `[tool] done${statusText}${exitText}\n`,
        threadId,
      },
    ],
  }
}

export function projectCodexOutputFromNotification({
  method,
  params,
  threadId,
}: CodexOutputProjectionInput): CodexOutputProjection {
  if (!method) {
    return { events: [] }
  }

  if (method === "item/agentMessage/delta") {
    return {
      events: [
        {
          method: "item/agentMessage/delta",
          text: codexTextFromParams(params),
          threadId,
        },
      ],
    }
  }

  if (
    method === "codex/event/agent_message_delta" ||
    method === "codex/event/agent_message_content_delta" ||
    method === "codex/event/agent_message"
  ) {
    return {
      events: [
        {
          method: "item/agentMessage/delta",
          text: codexTextFromParams(params),
          threadId,
        },
      ],
    }
  }

  if (
    method === "codex/event/raw_response_item" ||
    method === "codex/event/user_message"
  ) {
    const text = codexTextFromRawParams(params) || codexTextFromParams(params)
    return {
      events: [
        {
          method: "item/agentMessage/delta",
          text: toReadableDeltaText(text),
          threadId,
        },
      ],
      missingText: text ? undefined : debugInfoForMissingText(method, params),
    }
  }

  if (
    method === "item/completed" ||
    method === "codex/event/item_completed" ||
    method === "rawResponseItem/completed"
  ) {
    return {
      events: [{ method: "item/completed" }],
    }
  }

  if (method === "codex/event/exec_command_begin") {
    return projectToolBegin(params, threadId)
  }

  if (
    method === "item/commandExecution/outputDelta" ||
    method === "codex/event/exec_command_output_delta"
  ) {
    return projectToolOutputDelta(method, params, threadId)
  }

  if (method === "codex/event/exec_command_end") {
    return projectToolEnd(params, threadId)
  }

  return { events: [] }
}
