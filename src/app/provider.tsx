import { ReactNode, Suspense } from 'react'
import AppErrorPage from '@/features/errors/app-error.tsx'
import { ErrorBoundary } from 'react-error-boundary'

export default function AppProvider({ children }: { children: ReactNode }) {
    return (
        <Suspense fallback={null}>
            <ErrorBoundary FallbackComponent={AppErrorPage}>
                {children}
            </ErrorBoundary>
        </Suspense>
    )
}
