import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'BookBridge — AI Book Translation',
  description:
    'Upload a PDF, translate chapter by chapter with AI-powered glossary consistency, and read in an immersive bilingual view.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
