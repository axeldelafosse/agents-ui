# Shared Packages

This monorepo is split into reusable workspace packages:

- `@axel-delafosse/protocol`: protocol/rpc adapters, parsing, and stream/event types.
- `@axel-delafosse/agent-runtime`: agent runtime hooks and state/types.
- `@axel-delafosse/ui`: reusable UI components and stream rendering helpers.

## Local import examples

```ts
import { useAgentsRuntime } from "@axel-delafosse/agent-runtime"
import { useCodexRuntime } from "@axel-delafosse/agent-runtime/hooks/use-codex-runtime"
import { useActiveAgentView } from "@axel-delafosse/agent-runtime/hooks/use-active-agent-view"

import { Feed } from "@axel-delafosse/ui/feed"
import { ApprovalRequest } from "@axel-delafosse/ui/approval-request"
import { Shimmer } from "@axel-delafosse/ui/shimmer"
import { cn } from "@axel-delafosse/ui/utils"
```

The `app` package uses `@/*` for local app paths and `@axel-delafosse/*` for shared workspace package imports.

## Releasing later

All package entries are set to `private: false` with public publish config, ready to publish when appropriate. Pin versions per package before publishing.
