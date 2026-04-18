import './globals.css'
import { Fraunces, IBM_Plex_Sans } from 'next/font/google'
import { JotaiProvider } from '@/components/jotai-providers'
import { JotaiHydrate } from '@/components/jotai-hydrate'
import { loadSettings, loadHabitsData, loadCoinsData, loadWishlistData, loadServerSettings } from './actions/data'
import Layout from '@/components/Layout'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from "@/components/theme-provider"
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
})

const displayFont = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
})

export const metadata = {
  title: 'HabitTrove',
  description: 'Track your habits and get rewarded',
}

export const dynamic = 'force-dynamic' // needed to prevent nextjs from caching the load... functions in Layout component

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale();
  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  const [initialSettings, initialHabits, initialCoins, initialWishlist, initialServerSettings] = await Promise.all([
    loadSettings(),
    loadHabitsData(),
    loadCoinsData(),
    loadWishlistData(),
    loadServerSettings(),
  ])

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${displayFont.variable} font-sans`}>
        <JotaiProvider>
          <JotaiHydrate
            initialValues={{
              settings: initialSettings,
              habits: initialHabits,
              coins: initialCoins,
              wishlist: initialWishlist,
              serverSettings: initialServerSettings,
            }}
          >
            <NextIntlClientProvider locale={locale} messages={messages}>
              <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                forcedTheme="dark"
                enableSystem={false}
                disableTransitionOnChange
              >
                <ServiceWorkerRegister />
                <Layout>
                  {children}
                </Layout>
              </ThemeProvider>
            </NextIntlClientProvider>
          </JotaiHydrate>
        </JotaiProvider>
        <Toaster />
      </body>
    </html>
  )
}
