import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  Card,
  CardAction as CardActionPrimitive,
  CardContent as CardContentPrimitive,
  CardDescription as CardDescriptionPrimitive,
  CardFooter as CardFooterPrimitive,
  CardHeader as CardHeaderPrimitive,
  CardTitle as CardTitlePrimitive,
} from "./card"

interface ComposedCardProps {
  size?: "default" | "sm"
}

const ComposedCard = ({ size = "default" }: ComposedCardProps) => (
  <Card className="w-full max-w-md" size={size}>
    <CardHeaderPrimitive className="border-border/70 border-b">
      <CardTitlePrimitive>Core Agent Runtime</CardTitlePrimitive>
      <CardDescriptionPrimitive>
        Non-stream story coverage for shared UI primitives.
      </CardDescriptionPrimitive>
      <CardActionPrimitive>
        <button
          className="rounded-md border border-border bg-muted px-2 py-1 font-medium text-xs"
          type="button"
        >
          Reconnect
        </button>
      </CardActionPrimitive>
    </CardHeaderPrimitive>
    <CardContentPrimitive className="space-y-2">
      <p className="text-sm">Status: healthy</p>
      <p className="text-muted-foreground text-sm">
        3 agents active, 1 reconnecting, 0 blocked.
      </p>
    </CardContentPrimitive>
    <CardFooterPrimitive className="justify-between border-border/70 border-t">
      <span className="text-muted-foreground text-xs">Updated 2m ago</span>
      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-400 text-xs">
        live
      </span>
    </CardFooterPrimitive>
  </Card>
)

const meta = {
  title: "Components/UI/Card",
  component: Card,
  decorators: [
    (Story) => (
      <div className="dark min-h-80 bg-zinc-950 p-8 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Card>

export default meta

type Story = StoryObj<typeof meta>

export const Composed: Story = {
  render: () => <ComposedCard />,
}

export const CardHeader: Story = {
  render: () => (
    <Card className="w-full max-w-md">
      <CardHeaderPrimitive className="border-border/70 border-b">
        <CardTitlePrimitive>Header-level summary</CardTitlePrimitive>
        <CardDescriptionPrimitive>
          Header anchors the title, description, and optional actions.
        </CardDescriptionPrimitive>
      </CardHeaderPrimitive>
      <CardContentPrimitive className="text-sm">
        Content follows below the header.
      </CardContentPrimitive>
    </Card>
  ),
}

export const CardTitle: Story = {
  render: () => (
    <Card className="w-full max-w-md">
      <CardHeaderPrimitive className="border-border/70 border-b">
        <CardTitlePrimitive>Core Agent Runtime</CardTitlePrimitive>
      </CardHeaderPrimitive>
      <CardContentPrimitive className="text-sm">
        Title communicates the primary subject of the card.
      </CardContentPrimitive>
    </Card>
  ),
}

export const CardDescription: Story = {
  render: () => (
    <Card className="w-full max-w-md">
      <CardHeaderPrimitive className="border-border/70 border-b">
        <CardTitlePrimitive>Card Description</CardTitlePrimitive>
        <CardDescriptionPrimitive>
          Supplemental context appears under the card title.
        </CardDescriptionPrimitive>
      </CardHeaderPrimitive>
      <CardContentPrimitive className="text-sm">
        Use short supporting text for quick scanning.
      </CardContentPrimitive>
    </Card>
  ),
}

export const CardAction: Story = {
  render: () => (
    <Card className="w-full max-w-md">
      <CardHeaderPrimitive className="border-border/70 border-b">
        <CardTitlePrimitive>Agent session</CardTitlePrimitive>
        <CardActionPrimitive>
          <button
            className="rounded-md border border-border bg-muted px-2 py-1 font-medium text-xs"
            type="button"
          >
            Reconnect
          </button>
        </CardActionPrimitive>
      </CardHeaderPrimitive>
      <CardContentPrimitive className="text-sm">
        Actions align at the top-right of the header.
      </CardContentPrimitive>
    </Card>
  ),
}

export const CardContent: Story = {
  render: () => (
    <Card className="w-full max-w-md">
      <CardHeaderPrimitive className="border-border/70 border-b">
        <CardTitlePrimitive>Card Content</CardTitlePrimitive>
      </CardHeaderPrimitive>
      <CardContentPrimitive className="space-y-2 text-sm">
        <p className="text-sm">Status: healthy</p>
        <p className="text-muted-foreground text-sm">
          Content holds the primary body copy and custom layout blocks.
        </p>
      </CardContentPrimitive>
    </Card>
  ),
}

export const CardFooter: Story = {
  render: () => (
    <Card className="w-full max-w-md">
      <CardHeaderPrimitive className="border-border/70 border-b">
        <CardTitlePrimitive>Card Footer</CardTitlePrimitive>
      </CardHeaderPrimitive>
      <CardContentPrimitive className="text-sm">
        Footer provides trailing metadata and status affordances.
      </CardContentPrimitive>
      <CardFooterPrimitive className="justify-between border-border/70 border-t">
        <span className="text-muted-foreground text-xs">Updated 2m ago</span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-400 text-xs">
          live
        </span>
      </CardFooterPrimitive>
    </Card>
  ),
}

export const SizeVariants: Story = {
  render: () => (
    <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-2">
      <ComposedCard size="default" />
      <ComposedCard size="sm" />
    </div>
  ),
}
