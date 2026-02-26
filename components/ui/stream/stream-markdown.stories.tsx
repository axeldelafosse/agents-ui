import type { Meta, StoryObj } from "@storybook/nextjs"
import { StreamMarkdown } from "./stream-markdown"

const meta = {
  args: {
    text: "Simple markdown text for stream rendering.",
  },
  component: StreamMarkdown,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamMarkdown",
} satisfies Meta<typeof StreamMarkdown>

export default meta

type Story = StoryObj<typeof meta>

export const Plain: Story = {}

export const Rich: Story = {
  args: {
    text: `## Implementation Notes

- Use **typed fixtures** from \`components/__fixtures__/stream-items.ts\`.
- Document callback behavior for approval stories.
- Link: [Next.js docs](https://nextjs.org/docs).`,
  },
}

export const Shimmer: Story = {
  args: {
    shimmer: true,
    text: "Thinking through **edge cases** before applying the patch...",
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
}
