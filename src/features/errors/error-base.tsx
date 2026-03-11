import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

export function ErrorView({
    children,
    className
}: {
    children: ReactNode
    className?: string
}) {
    return (
        <main
            className={cn(
                'flex h-screen flex-col items-center justify-center bg-white p-8 text-center text-neutral-950',
                className
            )}
        >
            <div className="text-center">
                <p className="text-base font-semibold text-neutral-500">
                    Error
                </p>
                {children}
            </div>
        </main>
    )
}

export function ErrorHeader({
    children,
    className
}: {
    children: ReactNode
    className?: string
}) {
    return (
        <h1
            className={cn(
                'mt-4 text-3xl font-bold tracking-tight text-neutral-950 sm:text-5xl',
                className
            )}
        >
            {children}
        </h1>
    )
}

export function ErrorDescription({
    children,
    className
}: {
    children: ReactNode
    className?: string
}) {
    return (
        <p
            className={cn(
                'mt-6 text-base leading-7 text-neutral-600',
                className
            )}
        >
            {children}
        </p>
    )
}

export function ErrorActions({
    children,
    className
}: {
    children: ReactNode
    className?: string
}) {
    return (
        <div
            className={cn(
                'mt-10 flex items-center justify-center gap-x-6',
                className
            )}
        >
            {children}
        </div>
    )
}
