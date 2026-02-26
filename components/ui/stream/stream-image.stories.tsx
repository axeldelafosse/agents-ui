import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  createStreamItem,
  streamImageItem,
} from "@/components/__fixtures__/stream-items"
import { StreamImage } from "./stream-image"

const meta = {
  args: {
    item: streamImageItem,
  },
  component: StreamImage,
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "UI/Stream/StreamImage",
} satisfies Meta<typeof StreamImage>

export default meta

type Story = StoryObj<typeof meta>

export const DataUriPreview: Story = {}

export const ExternalImageLink: Story = {
  args: {
    item: createStreamItem("image", {
      data: {
        alt: "External screenshot",
        caption: "External URLs should render as links for safety.",
        src: "https://example.com/codex-preview.png",
      },
      id: "story-image-external-link-1",
    }),
  },
}
