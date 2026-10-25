import React from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import { MissionProvider } from '@/state/MissionProvider'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { AppShell } from './AppShell'
import { AppRouterProvider } from './routes'

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system">
        <TooltipProvider delayDuration={200}>
          <MissionProvider>
            <AppRouterProvider>
              <AppShell />
            </AppRouterProvider>
          </MissionProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
