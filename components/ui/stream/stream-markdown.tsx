import { Streamdown } from "streamdown"
import { cn } from "@/lib/utils"

interface StreamMarkdownProps {
  className?: string
  text: string
}

export function StreamMarkdown({ text, className }: StreamMarkdownProps) {
  return (
    <Streamdown
      className={cn(
        "text-sm leading-relaxed [&_a]:text-zinc-200 [&_code]:font-mono [&_code]:text-xs",
        className
      )}
    >
      {text}
    </Streamdown>
  )
}
