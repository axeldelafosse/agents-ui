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

import { AgentTabBar } from "@axel-delafosse/ui/agent-tab-bar"
import { StreamFeed } from "@axel-delafosse/ui/stream-feed"
import { StreamApprovalRequest } from "@axel-delafosse/ui/stream-approval-request"
import { Shimmer } from "@axel-delafosse/ui/shimmer"
import { cn } from "@axel-delafosse/ui/utils"
```

The `app` package currently aliases `@/app/features/*` for local app pages and uses flattened workspace package imports (for example `@/stream-feed`) for shared UI/runtime usage.

## Releasing later

All package entries are currently workspace-local (`private: true`). When you are ready to publish, switch package manifests to publishable metadata and pin versions per package.
