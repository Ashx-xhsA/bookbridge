// Book-bible scan sizing and liveness, shared by the scan routes and the
// review page (no server-only imports here).

// Mirrors SCAN_CHUNK_CHARS in bookbridge/harness/prescan.py: one model call
// per passage of about this many characters, then one call that writes the
// book overview.
export const SCAN_PASSAGE_CHARS = 12_000
const EXTRA_CALLS = 1
// Observed DeepSeek latency for one ~12k-char passage.
const SECONDS_PER_CALL = { min: 10, max: 25 }

// A running scan that has reported nothing for this long is assumed dead
// (e.g. the Worker restarted) and may be restarted. One step can take a few
// minutes when a call is retried, so this is generous.
export const SCAN_LOST_AFTER_MS = 10 * 60 * 1000

export function scanEstimate(sourceChars: number) {
  const calls = Math.ceil(sourceChars / SCAN_PASSAGE_CHARS) + EXTRA_CALLS
  const minutes = (seconds: number) => Math.max(1, Math.ceil((calls * seconds) / 60))
  return { calls, minMinutes: minutes(SECONDS_PER_CALL.min), maxMinutes: minutes(SECONDS_PER_CALL.max) }
}

export function isScanLost(
  bible: { scanStatus: string; scanStartedAt: Date | null; scanHeartbeatAt: Date | null },
  now = Date.now()
): boolean {
  if (bible.scanStatus !== 'SCANNING') return false
  const lastSign = bible.scanHeartbeatAt ?? bible.scanStartedAt
  return !lastSign || now - new Date(lastSign).getTime() > SCAN_LOST_AFTER_MS
}
