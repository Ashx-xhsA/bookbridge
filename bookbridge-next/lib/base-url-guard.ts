import { lookup as dnsLookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

/**
 * SSRF guard for the user's custom LLM base URL (OWASP A10). The Worker calls
 * this URL with the user's key, so it must be a public https endpoint. The
 * Worker re-checks before every call (DNS can change after this check).
 */

const BLOCKED = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT, incl. Alibaba Cloud metadata
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, incl. AWS/GCP/Azure metadata
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv4')
}
// BlockList also applies the IPv4 rules to IPv4-mapped IPv6 (::ffff:a.b.c.d).
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96], // NAT64
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv6')
}

type Lookup = (
  hostname: string,
  options: { all: true; verbatim: boolean }
) => Promise<{ address: string; family: number }[]>

export interface BaseUrlGuardOptions {
  lookup?: Lookup
  production?: boolean
}

/** True for anything that is not a public unicast IP (non-IPs included). */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 0) return true
  return BLOCKED.check(ip, version === 4 ? 'ipv4' : 'ipv6')
}

export async function isAllowedBaseUrl(
  raw: string,
  {
    lookup = (host, opts) => dnsLookup(host, opts),
    production = process.env.NODE_ENV === 'production',
  }: BaseUrlGuardOptions = {}
): Promise<boolean> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.username || url.password) return false
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1')

  // Local models (e.g. Ollama) during development only.
  if (!production && host === 'localhost' && ['http:', 'https:'].includes(url.protocol)) {
    return true
  }
  if (url.protocol !== 'https:' || !host) return false
  if (isIP(host)) return !isBlockedAddress(host)

  let addresses: { address: string }[]
  try {
    addresses = await lookup(host, { all: true, verbatim: true })
  } catch {
    return false
  }
  return addresses.length > 0 && addresses.every((a) => !isBlockedAddress(a.address))
}
