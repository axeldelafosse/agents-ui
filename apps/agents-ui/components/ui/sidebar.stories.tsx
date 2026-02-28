import type { Meta, StoryObj } from "@storybook/nextjs"
import { expect, userEvent, waitFor } from "@storybook/test"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "./sidebar"

const meta = {
  title: "Components/UI/Sidebar",
  component: Sidebar,
  decorators: [
    (Story) => (
      <div className="rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Sidebar>

export default meta

type Story = StoryObj<typeof meta>

const menuItems = ["Threads", "Runtime", "Tool calls", "History", "Settings"]

function SidebarDemo() {
  return (
    <SidebarProvider className="liquid-page" defaultOpen>
      <div className="relative h-[460px] overflow-hidden rounded-xl border border-zinc-800">
        <Sidebar collapsible="icon" variant="floating">
          <SidebarHeader className="p-2">
            <SidebarInput className="h-8" placeholder="Filter entries..." />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>Overview</SidebarMenuButton>
                </SidebarMenuItem>
                {menuItems.map((label, index) => (
                  <SidebarMenuItem key={label}>
                    <SidebarMenuButton>
                      <span>{label}</span>
                      <SidebarMenuBadge>{index + 1}</SidebarMenuBadge>
                    </SidebarMenuButton>
                    <SidebarMenuAction showOnHover>⚙</SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton>Diagnostics</SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton>Snapshots</SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenu>
            </SidebarGroup>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Actions</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>Inspect thread</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>Reopen socket</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>Auto follow: on</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              <SidebarGroupAction>✦</SidebarGroupAction>
            </SidebarGroup>
          </SidebarFooter>
        </Sidebar>
        <SidebarRail />
        <SidebarTrigger className="liquid-chip absolute top-4 left-4 z-50 size-9 rounded-full border-white/60 bg-white/70" />
        <main className="ml-16 flex min-h-full items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
            Main workspace panel.
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

export const Default: Story = {
  render: () => <SidebarDemo />,
}

function CollapsedSidebarDemo() {
  return (
    <SidebarProvider className="liquid-page" defaultOpen={false}>
      <div className="relative h-[460px] overflow-hidden rounded-xl border border-zinc-800">
        <Sidebar collapsible="icon" variant="floating">
          <SidebarHeader className="p-2">
            <SidebarInput className="h-8" placeholder="Filter entries..." />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>Overview</SidebarMenuButton>
                </SidebarMenuItem>
                {menuItems.map((label) => (
                  <SidebarMenuItem key={label}>
                    <SidebarMenuButton>{label}</SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>Auto follow: on</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarFooter>
        </Sidebar>
        <SidebarRail />
        <main className="ml-16 flex min-h-full items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
            Collapsed navigation.
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

export const Collapsed: Story = {
  render: () => <CollapsedSidebarDemo />,
}

export const CollapsedClickToExpand: Story = {
  render: () => <CollapsedSidebarDemo />,
  play: async ({ canvasElement }) => {
    const collapsedSidebar = canvasElement.querySelector(
      '[data-slot="sidebar"][data-state="collapsed"]'
    )
    if (!collapsedSidebar) {
      throw new Error("Collapsed sidebar root not found")
    }

    await userEvent.click(collapsedSidebar)

    await waitFor(() => {
      expect(collapsedSidebar).toHaveAttribute("data-state", "expanded")
    })
  },
}
