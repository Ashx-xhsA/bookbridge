import { describe, it, expect } from 'vitest'
import { createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import { PUBLIC_ROUTES } from '@/lib/public-routes'

// The same matcher middleware.ts builds: anything not listed requires sign-in.
const isPublic = createRouteMatcher(PUBLIC_ROUTES)
const at = (path: string) => isPublic(new NextRequest(`https://bookbridge.test${path}`))

const TOKEN = '1c59beca-1ad2-4733-b696-53fd50af865e'

describe('public routes', () => {
  it.each([
    '/',
    `/read/${TOKEN}`,
    '/read/demo',
    // The shared-link reader loads chapters and searches through these;
    // the token in the URL is the authorization.
    `/api/read/${TOKEN}`,
    `/api/read/${TOKEN}/chunks/cmvc15ugs000008jtzycz5brn`,
    `/api/read/${TOKEN}/search?q=lake`,
    '/api/internal/worker-callback',
    '/api/internal/worker-callback/bible/progress',
  ])('%s is reachable without signing in', (path) => {
    expect(at(path)).toBe(true)
  })

  it.each([
    '/dashboard',
    '/api/projects',
    '/api/projects/p1/chapters/c1',
    '/api/projects/p1/search?q=x',
    '/api/projects/p1/export?format=epub',
    '/api/upload',
    '/api/jobs',
    '/api/settings',
  ])('%s requires signing in', (path) => {
    expect(at(path)).toBe(false)
  })
})
