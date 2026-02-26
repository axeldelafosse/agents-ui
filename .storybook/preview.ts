import type { Preview } from "@storybook/nextjs"
import { createElement } from "react"

import "../app/globals.css"

const preview: Preview = {
  decorators: [
    (Story) => {
      const story = Story()

      return createElement(
        "div",
        {
          className: "dark",
          style: {
            background: "oklch(0.145 0 0)",
            minHeight: "100vh",
            "--font-sans": "ui-sans-serif, system-ui, sans-serif",
            "--font-geist-mono":
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
          },
        },
        story
      )
    },
  ],
  parameters: {
    backgrounds: {
      default: "app-dark",
      values: [{ name: "app-dark", value: "oklch(0.145 0 0)" }],
    },
    layout: "padded",
    viewport: {
      defaultViewport: "responsive",
    },
  },
}

export default preview
