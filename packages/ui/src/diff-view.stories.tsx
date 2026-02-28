import type { Meta, StoryObj } from "@storybook/nextjs"
import { DiffView } from "./diff-view"

const meta = {
  args: {
    patch: `--- a/src/main.ts\n+++ b/src/main.ts\n@@ -1,3 +1,3 @@\n-const greeting = "hello"\n+const greeting = "hello world"\n console.log(greeting)`,
  },
  component: DiffView,
  decorators: [
    (Story) => (
      <div className="max-w-4xl dark min-h-40 bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/DiffView",
} satisfies Meta<typeof DiffView>

export default meta

type Story = StoryObj<typeof meta>

export const ParsedPatch: Story = {}

export const RawPatchFallback: Story = {
  args: {
    patch: "No patch headers found in this payload.\nOutput streamed as raw patch text.",
  },
}
