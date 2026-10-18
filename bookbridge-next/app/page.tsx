import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import SiteHeader from '@/app/components/SiteHeader'
import AboutContent from '@/app/components/AboutContent'

// Signed-out visitors see the About page; signed-in users go straight to their library.
export default async function Home() {
  const { userId } = await auth()
  if (userId) return redirect('/dashboard')
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <SiteHeader signedIn={false} />
      <main className="flex-1">
        <AboutContent signedIn={false} />
      </main>
    </div>
  )
}
