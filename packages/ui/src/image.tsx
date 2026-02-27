import NextImage from "next/image"
import { asRecord, getMarkdown, getString, getValue } from "./data"
import { ItemShell } from "./item-shell"
import { Markdown } from "./markdown"
import type { StreamItem } from "./types"

interface AgentImageProps {
  item: StreamItem
}

const LOCAL_FILESYSTEM_PATH_PATTERN =
  /^((\/(Users|home|var|tmp|private|opt|mnt)\/)|([a-zA-Z]:\\))/

const canInlinePreview = (src: string): boolean => {
  if (src.startsWith("data:image/")) {
    return true
  }
  return src.startsWith("/") && !LOCAL_FILESYSTEM_PATH_PATTERN.test(src)
}

function ImageContent({ alt, src }: { alt: string; src: string }) {
  if (src.length === 0) {
    return <p className="text-zinc-400">No image source provided.</p>
  }

  if (canInlinePreview(src)) {
    return (
      <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
        <NextImage
          alt={alt}
          className="h-auto max-h-96 w-full rounded object-contain"
          height={512}
          src={src}
          unoptimized
          width={768}
        />
      </div>
    )
  }

  if (src.startsWith("http://") || src.startsWith("https://")) {
    return (
      <a
        className="font-mono text-xs text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:decoration-zinc-300"
        href={src}
        rel="noopener noreferrer"
        target="_blank"
      >
        {src}
      </a>
    )
  }

  return <p className="font-mono text-xs text-zinc-300">{src}</p>
}

export function AgentImage({ item }: AgentImageProps) {
  const nestedItem = asRecord(getValue(item.data, ["item", "source"]))
  const requestInput = asRecord(getValue(item.data, ["input"]))
  const src =
    getString(item.data, ["src", "url", "path", "filePath"]) ??
    getString(nestedItem, ["src", "url", "path", "filePath"]) ??
    getString(requestInput, ["src", "url", "path", "filePath"]) ??
    getString(item.data, ["text"]) ??
    ""
  const alt =
    getString(item.data, ["alt", "label", "description"]) ??
    getString(nestedItem, ["alt", "label", "description"]) ??
    "Image output"
  const caption =
    getMarkdown(item.data, ["caption", "summary", "message"]) ??
    getMarkdown(nestedItem, ["caption", "summary", "message", "description"])

  return (
    <ItemShell item={item} label="Image" tone="muted">
      <ImageContent alt={alt} src={src} />
      {caption && <Markdown className="mt-2" text={caption} />}
    </ItemShell>
  )
}
