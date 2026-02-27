# Release Plan

This repo uses Bun workspaces with three publishable packages:

- `@axel-delafosse/protocol`
- `@axel-delafosse/agent-runtime`
- `@axel-delafosse/ui`

## Release strategy

1. Install changesets once in the workspace:

```bash
bunx --bun changeset
```

2. Create a release note and version bump:

```bash
bunx --bun changeset
bun run changeset:version
```

3. Review generated changelogs/version updates.

4. Publish packages (manual):

```bash
bun run changeset:publish
```

### Automated CI release (recommended)

If you prefer CI-managed release flow:

- Add `NPM_TOKEN` as a repository secret.
- Push `.changeset/*.md` files to `main`.
- `changeset: publish` workflow runs `changesets/action` on `main`, versioning and publishing automatically.

If you prefer manual releases, run package-level publish directly:

```bash
bun publish ./packages/protocol --access public
bun publish ./packages/agent-runtime --access public
bun publish ./packages/ui --access public
```

## Import surfaces for consumers

Each package is accessible via workspace/public package entry points.

```ts
import { useAgentsRuntime } from "@axel-delafosse/agent-runtime"
import { useCodexRuntime } from "@axel-delafosse/agent-runtime/hooks/use-codex-runtime"

import { Feed } from "@axel-delafosse/ui/feed"
import { Markdown } from "@axel-delafosse/ui/markdown"
import { ApprovalRequest } from "@axel-delafosse/ui/approval-request"
import { cn } from "@axel-delafosse/ui/utils"
```

## Note

Current package manifests are set to `private: false` with public publish config so they can be published from CI or local tooling once you are ready.
