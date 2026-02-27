import { connect } from "node:net"

export function tcpProbe(
  host: string,
  port: number,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, timeoutMs)
    socket.on("connect", () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(true)
    })
    socket.on("error", () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}
