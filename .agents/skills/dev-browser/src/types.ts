// API request/response types - shared between client and server

export interface ServeOptions {
  cdpPort?: number
  headless?: boolean
  port?: number
  /** Directory to store persistent browser profiles (cookies, localStorage, etc.) */
  profileDir?: string
}

export interface ViewportSize {
  height: number
  width: number
}

export interface GetPageRequest {
  name: string
  /** Optional viewport size for new pages */
  viewport?: ViewportSize
}

export interface GetPageResponse {
  name: string
  targetId: string // CDP target ID for reliable page matching
  wsEndpoint: string
}

export interface ListPagesResponse {
  pages: string[]
}

export interface ServerInfoResponse {
  wsEndpoint: string
}
