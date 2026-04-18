import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white font-serif text-xl font-bold">
          B
        </div>
        <span className="font-serif text-2xl font-bold text-ink">
          BookBridge
        </span>
      </Link>
      <SignUp />
    </div>
  )
}
