import type { Meta, StoryObj } from "@storybook/nextjs"
import { useState } from "react"
import { Button } from "./button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet"

const meta = {
  component: Sheet,
  decorators: [
    (Story) => (
      <div className="min-h-72 rounded-lg bg-zinc-950 p-6 text-zinc-100">
        <Story />
      </div>
    ),
  ],
  title: "Components/UI/Sheet",
} satisfies Meta<typeof Sheet>

export default meta

type Story = StoryObj<typeof meta>

const rightSheetMeta = {
  contentTitle: "Agent detail panel",
  contentDescription: "Inspect recent stream events and action logs.",
}

function RightSheetDemo() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger render={<Button>Open Right Sheet</Button>} />
      <SheetContent className="max-w-sm" side="right">
        <SheetHeader>
          <SheetTitle>{rightSheetMeta.contentTitle}</SheetTitle>
          <SheetDescription>
            {rightSheetMeta.contentDescription}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-6 pb-4 text-sm text-zinc-300">
          <p>Shows runtime metadata and helper actions.</p>
          <p>Close to return to dashboard.</p>
        </div>
        <SheetFooter>
          <SheetClose render={<Button variant="outline">Close</Button>} />
          <Button onClick={() => setOpen(false)} variant="secondary">
            Close with state
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export const Right: Story = {
  render: () => <RightSheetDemo />,
}

function BottomSheetDemo() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        render={<Button variant="ghost">Open Bottom Sheet</Button>}
      />
      <SheetContent
        className="max-h-[60vh] p-0"
        showCloseButton={false}
        side="bottom"
      >
        <SheetHeader className="border-white/10 border-b px-6 pt-6 pb-4">
          <SheetTitle>Connection status</SheetTitle>
          <SheetDescription>
            Temporary network events and diagnostics.
          </SheetDescription>
        </SheetHeader>
        <div className="max-h-[40vh] space-y-2 overflow-auto px-6 py-4 text-sm text-zinc-300">
          <p>WebSocket ping: 250 ms</p>
          <p>Reconnect attempts: 0</p>
          <p>Buffer health: stable</p>
        </div>
        <SheetFooter className="px-6 pb-4">
          <Button onClick={() => setOpen(false)} size="sm">
            Dismiss
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export const Bottom: Story = {
  render: () => <BottomSheetDemo />,
}
