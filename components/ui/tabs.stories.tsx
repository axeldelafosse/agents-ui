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

const TabsListExample = () => (
  <div className="w-full max-w-xl space-y-6">
    <Tabs className="w-full" defaultValue="overview">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="overview">Default list</TabsTrigger>
        <TabsTrigger value="events">Events</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
      </TabsList>
      <TabsContent
        className="rounded-xl border border-border/70 bg-card px-4 py-3"
        value="overview"
      >
        <p className="text-sm">Default variant keeps a filled background.</p>
      </TabsContent>
      <TabsContent className="hidden" value="events" />
      <TabsContent className="hidden" value="logs" />
    </Tabs>
    <Tabs className="w-full" defaultValue="overview">
      <TabsList className="w-full justify-start" variant="line">
        <TabsTrigger value="overview">Line list</TabsTrigger>
        <TabsTrigger value="events">Events</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
      </TabsList>
      <TabsContent
        className="rounded-xl border border-border/70 bg-card px-4 py-3"
        value="overview"
      >
        <p className="text-sm">Line variant uses active underlines.</p>
      </TabsContent>
      <TabsContent className="hidden" value="events" />
      <TabsContent className="hidden" value="logs" />
    </Tabs>
  </div>
)

const TabsTriggerExample = () => (
  <Tabs className="w-full max-w-xl" defaultValue="active">
    <TabsList className="w-full justify-start">
      <TabsTrigger value="active">Active trigger</TabsTrigger>
      <TabsTrigger value="inactive">Inactive trigger</TabsTrigger>
      <TabsTrigger disabled value="disabled">
        Disabled trigger
      </TabsTrigger>
    </TabsList>
    <TabsContent
      className="rounded-xl border border-border/70 bg-card px-4 py-3"
      value="active"
    >
      <p className="text-sm">Active trigger styles and focus states.</p>
    </TabsContent>
    <TabsContent className="hidden" value="inactive" />
    <TabsContent className="hidden" value="disabled" />
  </Tabs>
)

const TabsContentExample = () => (
  <Tabs className="w-full max-w-xl" defaultValue="overview">
    <TabsList className="w-full justify-start">
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="history">History</TabsTrigger>
      <TabsTrigger value="alerts">Alerts</TabsTrigger>
    </TabsList>
    <TabsContent
      className="space-y-2 rounded-xl border border-border/70 bg-card px-4 py-3"
      value="overview"
    >
      <h3 className="font-medium text-sm">TabsContent panel</h3>
      <p className="text-sm">
        Panels can hold rich layout content while preserving keyboard
        navigation.
      </p>
    </TabsContent>
    <TabsContent
      className="space-y-2 rounded-xl border border-border/70 bg-card px-4 py-3"
      value="history"
    >
      <p className="text-sm">History panel placeholder content.</p>
    </TabsContent>
    <TabsContent
      className="space-y-2 rounded-xl border border-border/70 bg-card px-4 py-3"
      value="alerts"
    >
      <p className="text-sm">Alerts panel placeholder content.</p>
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

export const TabsListFocus: Story = {
  render: () => <TabsListExample />,
}

export const TabsTriggerFocus: Story = {
  render: () => <TabsTriggerExample />,
}

export const TabsContentFocus: Story = {
  render: () => <TabsContentExample />,
}
