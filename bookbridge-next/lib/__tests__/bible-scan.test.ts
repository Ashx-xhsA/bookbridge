import { describe, it, expect } from 'vitest'
import { SCAN_LOST_AFTER_MS, isScanLost, scanEstimate } from '@/lib/bible-scan'

describe('scanEstimate', () => {
  it('counts one call per 12k-char passage plus the overview', () => {
    expect(scanEstimate(796_213).calls).toBe(67 + 1)
    expect(scanEstimate(131_000).calls).toBe(11 + 1)
  })

  it('gives a minute range from 10–25 s per call', () => {
    const { minMinutes, maxMinutes } = scanEstimate(796_213)
    expect(minMinutes).toBe(12) // 68 × 10 s
    expect(maxMinutes).toBe(29) // 68 × 25 s
  })

  it('never estimates less than a minute', () => {
    expect(scanEstimate(500)).toEqual({ calls: 2, minMinutes: 1, maxMinutes: 1 })
  })
})

describe('isScanLost', () => {
  const now = new Date('2026-10-17T07:00:00Z').getTime()
  const ago = (ms: number) => new Date(now - ms)

  it('is false unless a scan is running', () => {
    expect(isScanLost({ scanStatus: 'IDLE', scanStartedAt: ago(3_600_000), scanHeartbeatAt: null }, now)).toBe(false)
  })

  it('is false while progress keeps arriving, however long the scan runs', () => {
    expect(
      isScanLost({ scanStatus: 'SCANNING', scanStartedAt: ago(7_200_000), scanHeartbeatAt: ago(60_000) }, now)
    ).toBe(false)
  })

  it('is true once nothing was heard for the lost window', () => {
    expect(
      isScanLost(
        { scanStatus: 'SCANNING', scanStartedAt: ago(SCAN_LOST_AFTER_MS * 2), scanHeartbeatAt: ago(SCAN_LOST_AFTER_MS + 1) },
        now
      )
    ).toBe(true)
  })

  it('falls back to the start time before the first progress report', () => {
    expect(
      isScanLost({ scanStatus: 'SCANNING', scanStartedAt: ago(SCAN_LOST_AFTER_MS + 1), scanHeartbeatAt: null }, now)
    ).toBe(true)
    expect(isScanLost({ scanStatus: 'SCANNING', scanStartedAt: ago(1000), scanHeartbeatAt: null }, now)).toBe(false)
  })
})
