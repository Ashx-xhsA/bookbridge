/**
 * The user's custom base URL is forwarded to the Worker, which calls it, so it
 * must point at a public https endpoint (OWASP A10 — SSRF).
 */
import { describe, expect, it, vi } from 'vitest'
import { isAllowedBaseUrl, isBlockedAddress } from '@/lib/base-url-guard'

const PUBLIC = [{ address: '104.18.6.192', family: 4 }]

function resolvesTo(...addresses: string[]) {
  return vi.fn().mockResolvedValue(
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  )
}

describe('isBlockedAddress', () => {
  it.each([
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '127.0.0.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.100.100.200',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:a9fe:a9fe',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  it.each(['104.18.6.192', '8.8.8.8', '172.32.0.1', '2606:4700::6810:6c0'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false)
  })

  it('blocks anything that is not an IP address', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true)
  })
})

describe('isAllowedBaseUrl', () => {
  const prod = { production: true }

  it('allows a public https endpoint', async () => {
    const lookup = vi.fn().mockResolvedValue(PUBLIC)
    expect(await isAllowedBaseUrl('https://api.example.com/v1', { ...prod, lookup })).toBe(true)
    expect(lookup).toHaveBeenCalledWith('api.example.com', { all: true, verbatim: true })
  })

  it('rejects plain http to a public host', async () => {
    const lookup = vi.fn().mockResolvedValue(PUBLIC)
    expect(await isAllowedBaseUrl('http://api.example.com/v1', { ...prod, lookup })).toBe(false)
  })

  it.each(['ftp://api.example.com/v1', 'file:///etc/passwd', 'not a url'])(
    'rejects %s',
    async (url) => {
      expect(await isAllowedBaseUrl(url, { ...prod, lookup: resolvesTo('104.18.6.192') })).toBe(false)
    }
  )

  it.each([
    ['private', '10.1.2.3'],
    ['loopback', '127.0.0.1'],
    ['metadata', '169.254.169.254'],
    ['unique-local v6', 'fd00::1'],
  ])('rejects a host that resolves to a %s address', async (_label, ip) => {
    expect(
      await isAllowedBaseUrl('https://evil.example/v1', { ...prod, lookup: resolvesTo(ip) })
    ).toBe(false)
  })

  it('rejects when any resolved address is private', async () => {
    const lookup = resolvesTo('104.18.6.192', '10.0.0.5')
    expect(await isAllowedBaseUrl('https://mixed.example/v1', { ...prod, lookup })).toBe(false)
  })

  it('rejects literal private IPs, including bracketed IPv6', async () => {
    const lookup = vi.fn()
    expect(await isAllowedBaseUrl('https://169.254.169.254/v1', { ...prod, lookup })).toBe(false)
    expect(await isAllowedBaseUrl('https://[::1]/v1', { ...prod, lookup })).toBe(false)
    expect(await isAllowedBaseUrl('https://[fe80::1]/v1', { ...prod, lookup })).toBe(false)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('rejects a host that does not resolve', async () => {
    const lookup = vi.fn().mockRejectedValue(new Error('ENOTFOUND'))
    expect(await isAllowedBaseUrl('https://nope.invalid/v1', { ...prod, lookup })).toBe(false)
  })

  it('rejects URLs carrying credentials', async () => {
    const lookup = vi.fn().mockResolvedValue(PUBLIC)
    expect(await isAllowedBaseUrl('https://u:p@api.example.com/v1', { ...prod, lookup })).toBe(false)
  })

  it('allows http://localhost outside production without a DNS lookup', async () => {
    const lookup = vi.fn()
    expect(await isAllowedBaseUrl('http://localhost:11434/v1', { production: false, lookup })).toBe(true)
    expect(await isAllowedBaseUrl('http://127.0.0.1:11434/v1', { production: false, lookup })).toBe(true)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('rejects http://localhost in production', async () => {
    const lookup = resolvesTo('127.0.0.1')
    expect(await isAllowedBaseUrl('http://localhost:11434/v1', { ...prod, lookup })).toBe(false)
  })

  it('still rejects other private hosts outside production', async () => {
    expect(
      await isAllowedBaseUrl('http://10.0.0.1/v1', { production: false, lookup: resolvesTo('10.0.0.1') })
    ).toBe(false)
  })
})
