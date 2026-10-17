import { isScanLost } from '@/lib/bible-scan'

// What the review page needs to show a bible's review and scan state.
export const BIBLE_STATE = {
  status: true,
  scanStatus: true,
  styleGuide: true,
  jobId: true,
  updatedAt: true,
  scanStartedAt: true,
  scanHeartbeatAt: true,
  scanDone: true,
  scanTotal: true,
} as const

type BibleRow = {
  status: string
  scanStatus: string
  styleGuide: string
  jobId: string | null
  updatedAt: Date
  scanStartedAt: Date | null
  scanHeartbeatAt: Date | null
  scanDone: number
  scanTotal: number
}

// The heartbeat itself stays server-side; the page only needs whether it is lost.
export function toBibleState(row: BibleRow) {
  return {
    status: row.status,
    scanStatus: row.scanStatus,
    styleGuide: row.styleGuide,
    jobId: row.jobId,
    updatedAt: row.updatedAt,
    scanStartedAt: row.scanStartedAt,
    scanDone: row.scanDone,
    scanTotal: row.scanTotal,
    scanLost: isScanLost(row),
  }
}
