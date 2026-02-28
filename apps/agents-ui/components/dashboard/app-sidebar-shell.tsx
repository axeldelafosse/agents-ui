"use client"

import type { PropsWithChildren } from "react"
import {
  AppSidebar,
  type AppSidebarProps,
} from "@/components/dashboard/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export function AppSidebarShell({
  children,
  ...appSidebarProps
}: PropsWithChildren<AppSidebarProps>) {
  return (
    <SidebarProvider className="liquid-page relative min-h-screen">
      <AppSidebar {...appSidebarProps} />
      <SidebarTrigger className="liquid-chip fixed top-4 left-4 z-50 size-9 rounded-full border-white/60 bg-white/70 shadow-[0_20px_35px_-24px_oklch(0.26_0.03_245/0.6)] transition duration-200 ease-linear md:hidden dark:border-white/20 dark:bg-white/10 dark:shadow-[0_20px_35px_-24px_oklch(0_0_0/0.75)]" />
      <SidebarInset className="bg-transparent">
        <div className="relative min-w-0 flex-1 px-4 pt-16 md:px-6 md:pt-4">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
