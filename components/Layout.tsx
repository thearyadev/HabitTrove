import ClientWrapper from './ClientWrapper'
import Header from './Header'
import Navigation from './Navigation'
import PermissionError from './PermissionError'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <ClientWrapper>
        <Header />
        <div className="mx-auto flex w-full max-w-screen-2xl gap-0 pb-24 lg:pb-0">
          <Navigation viewPort='main' />
          <div className="min-w-0 flex-1">
            <main className="min-h-[calc(100vh-4rem)] px-4 py-6 sm:px-6">
              <div className="space-y-6">
                <PermissionError />
                {children}
              </div>
            </main>
          </div>
        </div>
        <Navigation viewPort='mobile' />
      </ClientWrapper>
    </div>
  )
}
