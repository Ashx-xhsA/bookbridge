import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

function secretsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// Server-to-server callbacks from the Worker carry X-Worker-Secret. Returns
// an error response to send, or null when the caller is the Worker. Fails
// closed (500) when the secret is not configured.
export function rejectUnlessWorker(req: NextRequest, route: string): NextResponse | null {
  const expected = process.env.WORKER_CALLBACK_SECRET
  if (!expected) {
    console.error(`[${route}] WORKER_CALLBACK_SECRET is not configured`)
    return NextResponse.json({ error: 'Callback receiver not configured' }, { status: 500 })
  }
  const provided = req.headers.get('x-worker-secret') ?? ''
  if (!provided || !secretsEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
