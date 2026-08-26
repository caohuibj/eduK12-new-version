type SocketAddressLike = {
  handshake?: {
    address?: string | null
    headers?: Record<string, string | string[] | undefined>
  }
  conn?: {
    remoteAddress?: string | null
  }
}

type ProxyAddressRequest = {
  headers: Record<string, string | string[] | undefined>
  socket: {
    remoteAddress: string
  }
}

type ProxyAddress = {
  all(
    request: ProxyAddressRequest,
    trust: (address: string, index: number) => boolean
  ): string[]
}

// Express already depends on proxy-addr. Use the same resolver semantics for
// Socket.IO instead of trusting a forwarded header unconditionally.
const proxyAddress = require('proxy-addr') as ProxyAddress

export function resolveSocketClientIp(
  socket: SocketAddressLike,
  trustProxyHops: number
): string {
  const remoteAddress =
    socket.conn?.remoteAddress || socket.handshake?.address || 'unknown'

  if (trustProxyHops <= 0) {
    return remoteAddress
  }

  try {
    const addresses = proxyAddress.all(
      {
        headers: socket.handshake?.headers || {},
        socket: { remoteAddress },
      },
      (_address, index) => index < trustProxyHops
    )
    return addresses[addresses.length - 1] || remoteAddress
  } catch {
    return remoteAddress
  }
}
