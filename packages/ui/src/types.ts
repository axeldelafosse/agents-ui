import type { StreamItem } from "@axel-delafosse/protocol/stream-items"

export type { StreamItem } from "@axel-delafosse/protocol/stream-items"

export type StreamApprovalInputValue = string | Record<string, string>

export interface StreamItemComponentProps {
  className?: string
  item: StreamItem
}

export interface StreamApprovalCallbacks {
  onApprove?: (item: StreamItem) => void
  onApproveForSession?: (item: StreamItem) => void
  onDeny?: (item: StreamItem) => void
  onSubmitInput?: (item: StreamItem, value: StreamApprovalInputValue) => void
}
