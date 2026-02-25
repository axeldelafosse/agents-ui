---
name: is-react-compiling-my-code
description: Audit which React components and hooks are successfully compiled by React Compiler, and which fail silently.
---

# Is React Compiling My Code?

Analyze the codebase to determine which components and hooks are successfully compiled (memoized) by React Compiler, and which fail silently.

## Steps

1. **Install dependencies** (only needed once):

```bash
cd .agents/skills/is-react-compiling-my-code && npm install
```

2. **Run the analysis script**:

```bash
node .agents/skills/is-react-compiling-my-code/scripts/analyze.mjs [paths...] [flags]
```

- Default path: project root (nearest `package.json` above CWD)
- Flags:
  - `--failures-only` — only show functions that failed to compile
  - `--summary` — output a human-readable summary instead of JSON

Examples:
```bash
# Full JSON report for the whole project
node .agents/skills/is-react-compiling-my-code/scripts/analyze.mjs

# Human-readable summary
node .agents/skills/is-react-compiling-my-code/scripts/analyze.mjs --summary

# Only failures for a specific directory
node .agents/skills/is-react-compiling-my-code/scripts/analyze.mjs src/components --failures-only --summary

# Single file analysis
node .agents/skills/is-react-compiling-my-code/scripts/analyze.mjs src/App.tsx
```

3. **Interpret results**. Each function gets one of these event kinds:

| Event Kind       | Meaning                                                    | Action Needed? |
|------------------|------------------------------------------------------------|----------------|
| `CompileSuccess` | Successfully memoized by React Compiler                    | No             |
| `CompileError`   | Failed to compile — has `reason`, `category`, `severity`   | Yes            |
| `CompileSkip`    | Opted out via `"use no memo"` directive                    | Review if intentional |
| `PipelineError`  | Internal compiler bug                                      | Report upstream |

4. **Present findings** as a summary table showing total functions, compiled, failed, skipped, and a breakdown of errors by category.

5. **Offer to fix** failures. Common fix patterns by error category:

| Category              | Common Fix                                                          |
|-----------------------|---------------------------------------------------------------------|
| `Hooks`               | Ensure hooks are called unconditionally and at the top level        |
| `Immutability`        | Avoid mutating props, state, or values returned from hooks          |
| `Ref`                 | Don't read/write `.current` during render; move to effects/handlers |
| `RenderSetState`      | Move `setState` calls out of the render path into effects/handlers  |
| `UnsupportedSyntax`   | Simplify or restructure unsupported patterns                        |
| `InvalidReact`        | Fix violations of the Rules of React                                |
| `InvalidConfig`       | Fix `eslint-plugin-react-compiler` configuration                    |
