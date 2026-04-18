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
        <body className="min-h-screen bg-cream text-ink antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
