#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { transformSync } from "@babel/core"

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith("--")))
const positional = args.filter((a) => !a.startsWith("--"))

const failuresOnly = flags.has("--failures-only")
const summaryMode = flags.has("--summary")

// ---------------------------------------------------------------------------
// Find project root (walk up to nearest package.json or .git)
// ---------------------------------------------------------------------------
function findProjectRoot(startDir) {
  let dir = startDir
  while (dir !== "/") {
    try {
      statSync(join(dir, "package.json"))
      return dir
    } catch {
      dir = resolve(dir, "..")
    }
  }
  return startDir
}

const projectRoot = findProjectRoot(process.cwd())

// ---------------------------------------------------------------------------
// Resolve babel-plugin-react-compiler from the project's node_modules.
// In monorepos (pnpm, yarn workspaces), the plugin may only be resolvable
// from the package that declares it, so we try multiple locations:
// target paths → CWD → project root.
// ---------------------------------------------------------------------------
const skillDir = fileURLToPath(new URL(".", import.meta.url))
const skillRequire = createRequire(join(skillDir, "../package.json"))

function resolveReactCompiler() {
  const searchRoots = [
    ...positional.map((p) => resolve(projectRoot, p)),
    process.cwd(),
    projectRoot,
  ]

  for (const root of searchRoots) {
    try {
      const stat = statSync(root)
      const dir = stat.isFile() ? resolve(root, "..") : root
      // Walk up from dir to find the nearest package.json to resolve from
      let current = dir
      while (current !== "/") {
        const pkgPath = join(current, "package.json")
        try {
          statSync(pkgPath)
          const req = createRequire(pkgPath)
          return req.resolve("babel-plugin-react-compiler")
        } catch {
          current = resolve(current, "..")
        }
      }
    } catch {
      // target path doesn't exist, skip
    }
  }
  return null
}

const reactCompilerPlugin = resolveReactCompiler()
if (!reactCompilerPlugin) {
  console.error(
    "Error: babel-plugin-react-compiler not found. Install it in your project first."
  )
  process.exit(1)
}

let tsPresetPath
try {
  tsPresetPath = skillRequire.resolve("@babel/preset-typescript")
} catch {
  console.error(
    "Error: @babel/preset-typescript not found. Run `cd .agents/skills/is-react-compiling-my-code && npm install` first."
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Discover source files
// ---------------------------------------------------------------------------
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"])
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  "coverage",
  ".git",
])
const IGNORE_PATTERNS = [/\.test\./, /\.spec\./, /\.stories\./]

function discoverFiles(dir) {
  const results = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue
    }
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...discoverFiles(fullPath))
    } else if (entry.isFile()) {
      if (!EXTENSIONS.has(extname(entry.name))) {
        continue
      }
      if (IGNORE_PATTERNS.some((p) => p.test(entry.name))) {
        continue
      }
      results.push(fullPath)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Analyze
// ---------------------------------------------------------------------------
const events = [] // { file, kind, fnName, fnLoc, detail? }

function logEvent(filename, event) {
  // Normalize to relative path from project root
  const normalizedFile = filename.startsWith("/")
    ? relative(projectRoot, filename)
    : filename
  const entry = {
    file: normalizedFile,
    kind: event.kind,
    fnName: event.fnName ?? null,
    fnLoc: event.fnLoc ?? null,
  }

  if (event.kind === "CompileError" && event.detail) {
    entry.reason = event.detail.reason ?? String(event.detail)
    entry.description = event.detail.description ?? null
    entry.category = event.detail.category ?? null
    entry.severity = event.detail.severity ?? null
    entry.loc = event.detail.loc ?? null
  }

  if (event.kind === "CompileSkip") {
    entry.reason = event.reason ?? null
    entry.loc = event.loc ?? null
  }

  if (event.kind === "PipelineError") {
    entry.reason =
      typeof event.data === "string" ? event.data : String(event.data)
  }

  if (event.kind === "CompileSuccess") {
    entry.memoSlots = event.memoSlots ?? 0
    entry.memoBlocks = event.memoBlocks ?? 0
    entry.memoValues = event.memoValues ?? 0
  }

  events.push(entry)
}

const targetPaths =
  positional.length > 0
    ? positional.map((p) => resolve(projectRoot, p))
    : [projectRoot]

const allFiles = []
for (const target of targetPaths) {
  try {
    const stat = statSync(target)
    if (stat.isDirectory()) {
      allFiles.push(...discoverFiles(target))
    } else if (stat.isFile()) {
      allFiles.push(target)
    }
  } catch {
    console.error(`Warning: path not found: ${target}`)
  }
}

if (allFiles.length === 0) {
  console.error("No source files found.")
  process.exit(1)
}

let filesProcessed = 0
let filesErrored = 0

for (const file of allFiles) {
  const relPath = relative(projectRoot, file)
  const ext = extname(file)
  const isTsx = ext === ".tsx" || ext === ".jsx"
  const isTs = ext === ".ts" || ext === ".tsx"

  let code
  try {
    code = readFileSync(file, "utf-8")
  } catch {
    continue
  }

  const presets = []
  if (isTs) {
    presets.push([tsPresetPath, { isTSX: isTsx, allExtensions: true }])
  }

  try {
    transformSync(code, {
      filename: relPath,
      configFile: false,
      babelrc: false,
      presets,
      plugins: [
        [
          reactCompilerPlugin,
          {
            noEmit: true,
            panicThreshold: "none",
            logger: { logEvent },
          },
        ],
      ],
    })
    filesProcessed++
  } catch (err) {
    filesErrored++
    // Babel parse errors etc. — skip silently in summary, log in JSON
    if (!summaryMode) {
      events.push({
        file: relPath,
        kind: "ParseError",
        fnName: null,
        fnLoc: null,
        reason: err.message?.split("\n")[0] ?? String(err),
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Build report
// ---------------------------------------------------------------------------
const compiled = events.filter((e) => e.kind === "CompileSuccess")
const failed = events.filter((e) => e.kind === "CompileError")
const skipped = events.filter((e) => e.kind === "CompileSkip")
const pipelineErrors = events.filter((e) => e.kind === "PipelineError")
const parseErrors = events.filter((e) => e.kind === "ParseError")

const errorsByCategory = {}
for (const e of failed) {
  const cat = e.category ?? "Unknown"
  errorsByCategory[cat] = (errorsByCategory[cat] ?? 0) + 1
}

if (summaryMode) {
  // Human-readable output
  console.log("\n=== React Compiler Analysis ===\n")
  console.log(`Files scanned:    ${filesProcessed}`)
  if (filesErrored > 0) {
    console.log(`Files with parse errors: ${filesErrored}`)
  }
  console.log(
    `Total functions:  ${events.filter((e) => e.kind !== "ParseError").length}`
  )
  console.log(`  Compiled:       ${compiled.length}`)
  console.log(`  Failed:         ${failed.length}`)
  console.log(`  Skipped:        ${skipped.length}`)
  if (pipelineErrors.length > 0) {
    console.log(`  Pipeline errors: ${pipelineErrors.length}`)
  }

  if (Object.keys(errorsByCategory).length > 0) {
    console.log("\n--- Errors by Category ---\n")
    const sorted = Object.entries(errorsByCategory).sort((a, b) => b[1] - a[1])
    for (const [cat, count] of sorted) {
      console.log(`  ${cat}: ${count}`)
    }
  }

  const failures = failuresOnly ? failed : [...failed, ...pipelineErrors]

  if (failures.length > 0) {
    console.log("\n--- Failures ---\n")
    // Group by file
    const byFile = {}
    for (const e of failures) {
      ;(byFile[e.file] ??= []).push(e)
    }
    for (const [file, errs] of Object.entries(byFile)) {
      console.log(`${file}:`)
      for (const e of errs) {
        const loc = e.fnLoc
          ? `:${e.fnLoc.start?.line ?? "?"}:${e.fnLoc.start?.column ?? "?"}`
          : ""
        const name = e.fnName ? ` (${e.fnName})` : ""
        const cat = e.category ? ` [${e.category}]` : ""
        console.log(`  ${loc}${name}${cat} ${e.reason ?? ""}`)
      }
    }
  }

  if (!failuresOnly && skipped.length > 0) {
    console.log("\n--- Skipped (opted out) ---\n")
    for (const e of skipped) {
      const loc = e.fnLoc ? `${e.file}:${e.fnLoc.start?.line ?? "?"}` : e.file
      console.log(`  ${loc} — ${e.reason ?? "unknown reason"}`)
    }
  }

  const total = events.filter((e) => e.kind !== "ParseError").length
  if (total > 0) {
    const pct = ((compiled.length / total) * 100).toFixed(1)
    console.log(`\nCompilation rate: ${pct}% (${compiled.length}/${total})`)
  }
} else {
  // JSON output
  const fileMap = {}
  const relevantEvents = failuresOnly
    ? events.filter(
        (e) =>
          e.kind === "CompileError" ||
          e.kind === "PipelineError" ||
          e.kind === "ParseError"
      )
    : events

  for (const e of relevantEvents) {
    ;(fileMap[e.file] ??= { functions: [] }).functions.push({
      name: e.fnName,
      line: e.fnLoc?.start?.line ?? null,
      col: e.fnLoc?.start?.column ?? null,
      status: e.kind,
      ...(e.reason && { reason: e.reason }),
      ...(e.description && { description: e.description }),
      ...(e.category && { category: e.category }),
      ...(e.severity && { severity: e.severity }),
      ...(e.memoSlots !== undefined && { memoSlots: e.memoSlots }),
    })
  }

  const report = {
    totalFiles: filesProcessed,
    totalFunctions: events.filter((e) => e.kind !== "ParseError").length,
    compiled: compiled.length,
    failed: failed.length,
    skipped: skipped.length,
    pipelineErrors: pipelineErrors.length,
    errorsByCategory,
    files: fileMap,
  }

  console.log(JSON.stringify(report, null, 2))
}
