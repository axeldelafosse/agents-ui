import type { Meta, StoryObj } from "@storybook/nextjs"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface TabsExampleProps {
  listVariant?: "default" | "line"
}

const TabsExample = ({ listVariant = "default" }: TabsExampleProps) => (
  <Tabs className="w-full max-w-xl" defaultValue="overview">
    <TabsList className="w-full justify-start" variant={listVariant}>
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="events">Events</TabsTrigger>
      <TabsTrigger value="logs">Logs</TabsTrigger>
    </TabsList>
    <TabsContent
      className="rounded-xl border border-border/70 bg-card px-4 py-3"
      value="overview"
    >
      <p className="text-sm">Core status and connection health summary.</p>
    </TabsContent>
    <TabsContent
      className="rounded-xl border border-border/70 bg-card px-4 py-3"
      value="events"
    >
      <p className="text-sm">Recent approval requests and plan updates.</p>
    </TabsContent>
    <TabsContent
      className="rounded-xl border border-border/70 bg-card px-4 py-3"
      value="logs"
    >
      <p className="text-sm">Transport diagnostics and reconnect traces.</p>
    </TabsContent>
  </Tabs>
)

const meta = {
  title: "Components/UI/Tabs",
  component: Tabs,
  decorators: [
    (Story) => (
      <div className="dark min-h-72 bg-zinc-950 p-8 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Tabs>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => <TabsExample />,
}

export const LineVariant: Story = {
  render: () => <TabsExample listVariant="line" />,
}
