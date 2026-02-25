# agents-ui

```bash
bun install
bun dev
```

Open http://localhost:3000

## Tailscale Discovery

For agents running across VMs on a Tailscale network, set these env vars for the
web app:

```bash
TAILSCALE_API_KEY=tskey-api-...
TAILSCALE_TAILNET=-              # "-" = your default tailnet
```

First, add the tags to your Tailscale ACL policy
([admin console → Access Controls](https://login.tailscale.com/admin/acls/file)):

```json
{
  "tagOwners": {
    "tag:agent":        ["autogroup:admin"],
    "tag:agent-claude": ["autogroup:admin"],
    "tag:agent-codex":  ["autogroup:admin"]
  }
}
```

Then tag your agent VMs when provisioning:

```bash
# Claude Code relay VM
tailscale up --advertise-tags=tag:agent-claude

# Codex app-server VM
tailscale up --advertise-tags=tag:agent-codex

# Both protocols
tailscale up --advertise-tags=tag:agent
```

> **Note:** `tailscale up` requires re-specifying all non-default flags.
> If you get an error, add them (e.g. `--accept-routes`). The error message
> will show the full command you need.

The frontend calls `GET /api/discover` on load, which queries the Tailscale API
for tagged devices and tries connecting to known ports on each.

No login required — being on the tailnet IS the auth.

## Codex schemas

Generated Codex app-server types are checked into `codex-app-server-schemas/`.

```bash
# update from a freshly generated schema directory
bun run codex-schemas:update codex-app-server-schemas
```
