import type { Meta, StoryObj } from "@storybook/nextjs"
import { Button } from "./button"

const meta = {
  component: Button,
  decorators: [
    (Story) => (
      <div className="rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "Components/UI/Button",
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => <Button>Connect Agent</Button>,
}

export const Secondary: Story = {
  render: () => <Button variant="secondary">Secondary action</Button>,
}

export const Outline: Story = {
  render: () => <Button variant="outline">Outline variant</Button>,
}

export const Destructive: Story = {
  render: () => <Button variant="destructive">Abort</Button>,
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button size="xs">xs</Button>
      <Button size="sm">sm</Button>
      <Button size="default">default</Button>
      <Button size="lg">lg</Button>
      <Button aria-label="Edit" size="icon-sm" />
    </div>
  ),
}
