import type { Meta, StoryObj } from "@storybook/nextjs"
import { Input } from "./input"

const meta = {
  component: Input,
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "Components/UI/Input",
} satisfies Meta<typeof Input>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Input aria-label="Default input" placeholder="Type a message" />
  ),
}

export const Disabled: Story = {
  render: () => (
    <Input aria-label="Disabled input" disabled placeholder="Read-only state" />
  ),
}

export const UrlInput: Story = {
  render: () => (
    <Input
      aria-label="Endpoint input"
      placeholder="ws://localhost:4500"
      type="url"
    />
  ),
}
