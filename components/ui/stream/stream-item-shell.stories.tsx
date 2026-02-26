import type { Meta, StoryObj } from "@storybook/nextjs"
import { createStreamItem } from "@/components/__fixtures__/stream-items"
import { StreamItemShell } from "./stream-item-shell"

const TONES = ["default", "muted", "success", "warning", "danger"] as const

type Tone = (typeof TONES)[number]

const itemByTone: Record<Tone, ReturnType<typeof createStreamItem>> = {
  danger: createStreamItem("tool_call", {
    id: "story-shell-tone-danger-1",
    status: "error",
  }),
  default: createStreamItem("tool_call", {
    id: "story-shell-tone-default-1",
    status: "streaming",
  }),
  muted: createStreamItem("tool_call", {
    id: "story-shell-tone-muted-1",
  }),
  success: createStreamItem("tool_call", {
    id: "story-shell-tone-success-1",
  }),
  warning: createStreamItem("tool_call", {
    id: "story-shell-tone-warning-1",
  }),
}

const meta = {
  args: {
    children: <p>Shell content for stream items.</p>,
    item: itemByTone.default,
    label: "Tool Call",
  },
  component: StreamItemShell,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamItemShell",
} satisfies Meta<typeof StreamItemShell>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const HeaderRightAndMeta: Story = {
  args: {
    headerRight: (
      <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
        agent-2
      </span>
    ),
    item: itemByTone.success,
    label: "File Change",
    meta: (
      <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] text-emerald-200 normal-case">
        applied
      </span>
    ),
    tone: "success",
  },
}

export const ToneVariants: Story = {
  render: () => (
    <div className="space-y-3">
      {TONES.map((tone) => (
        <StreamItemShell
          item={itemByTone[tone]}
          key={tone}
          label={`Tone: ${tone}`}
          tone={tone}
        >
          <p className="text-zinc-300">
            Preview of the {tone} shell treatment.
          </p>
        </StreamItemShell>
      ))}
    </div>
  ),
}
