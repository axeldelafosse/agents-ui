import type { Meta, StoryObj } from "@storybook/nextjs"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface ComposedCardProps {
  size?: "default" | "sm"
}

const ComposedCard = ({ size = "default" }: ComposedCardProps) => (
  <Card className="w-full max-w-md" size={size}>
    <CardHeader className="border-border/70 border-b">
      <CardTitle>Core Agent Runtime</CardTitle>
      <CardDescription>
        Non-stream story coverage for shared UI primitives.
      </CardDescription>
      <CardAction>
        <button
          className="rounded-md border border-border bg-muted px-2 py-1 font-medium text-xs"
          type="button"
        >
          Reconnect
        </button>
      </CardAction>
    </CardHeader>
    <CardContent className="space-y-2">
      <p className="text-sm">Status: healthy</p>
      <p className="text-muted-foreground text-sm">
        3 agents active, 1 reconnecting, 0 blocked.
      </p>
    </CardContent>
    <CardFooter className="justify-between border-border/70 border-t">
      <span className="text-muted-foreground text-xs">Updated 2m ago</span>
      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-400 text-xs">
        live
      </span>
    </CardFooter>
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

export const SizeVariants: Story = {
  render: () => (
    <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-2">
      <ComposedCard size="default" />
      <ComposedCard size="sm" />
    </div>
  ),
}
