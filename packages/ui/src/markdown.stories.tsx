import type { Meta, StoryObj } from "@storybook/nextjs"
import { Markdown } from "./markdown"

const meta = {
  args: {
    text: "Simple markdown text for stream rendering.",
  },
  component: Markdown,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Markdown",
} satisfies Meta<typeof Markdown>

export default meta

type Story = StoryObj<typeof meta>

export const Plain: Story = {}

export const Rich: Story = {
  args: {
    text: `## Implementation Notes

- Use **typed fixtures** from \`__fixtures__/stream-items.ts\`.
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
