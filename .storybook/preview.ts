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
          },
        },
        story
      )
    },
  ],
}

export default preview
