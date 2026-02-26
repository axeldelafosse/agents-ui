import { NextResponse } from "next/server"
import { tcpProbe } from "@/lib/tcp-probe"

const LOCAL_PROBE_HOSTS = ["127.0.0.1", "::1", "localhost"] as const
const PROBE_TIMEOUT_MS = 500

async function probeAnyLocalhost(port: number): Promise<boolean> {
  const checks = await Promise.all(
    LOCAL_PROBE_HOSTS.map((host) => tcpProbe(host, port, PROBE_TIMEOUT_MS))
  )
  return checks.some(Boolean)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const portsParam = searchParams.get("ports") || ""
  const ports = portsParam
    .split(",")
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => n > 0 && n < 65_536)

  const results = await Promise.all(
    ports.map((p) => probeAnyLocalhost(p).then((ok) => (ok ? p : null)))
  )
  const open = results.filter((p): p is number => p !== null)

  return NextResponse.json(open, {
    headers: { "Access-Control-Allow-Origin": "*" },
  })
}
