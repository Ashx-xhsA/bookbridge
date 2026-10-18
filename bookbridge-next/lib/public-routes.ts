// Routes reachable without a Clerk session (middleware.ts protects the rest).
export const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/read/(.*)',
  // Shared-link reader APIs (outline, chapters, search): the publicToken in
  // the URL is the authorization, checked inside each route.
  '/api/read/(.*)',
  // Server-to-server endpoints. Auth is handled inside the route via a
  // shared secret header; Clerk must not 404 these before the handler runs.
  '/api/internal/(.*)',
]
