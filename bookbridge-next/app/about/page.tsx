import { auth } from '@clerk/nextjs/server'
import SiteHeader from '@/app/components/SiteHeader'
import AboutContent from '@/app/components/AboutContent'

export const metadata = { title: 'About — BookBridge' }

export default async function AboutPage() {
  const { userId } = await auth()
  const signedIn = !!userId
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <SiteHeader signedIn={signedIn} />
      <main className="flex-1">
        <AboutContent signedIn={signedIn} />
      </main>
    </div>
  )
}
