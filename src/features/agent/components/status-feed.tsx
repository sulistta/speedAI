import {
    AlertCircle,
    CheckCircle2,
    Clock3,
    LoaderCircle,
    MessageSquareDashed,
    Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatStatusTime } from '@/features/agent/utils'
import type { AgentStatusEntry, AgentStatusTone } from '@/features/agent/types'

const toneStyles: Record<AgentStatusTone, string> = {
    idle: 'border-[var(--surface-stroke)] bg-[var(--elevated-surface)]',
    info: 'border-sky-500/20 bg-sky-500/10',
    thinking: 'border-amber-500/25 bg-amber-500/10',
    executing: 'border-cyan-500/25 bg-cyan-500/10',
    success: 'border-emerald-500/25 bg-emerald-500/10',
    error: 'border-rose-500/25 bg-rose-500/10'
}

const toneLabelStyles: Record<AgentStatusTone, string> = {
    idle: 'text-[var(--text-tertiary)]',
    info: 'text-sky-500 dark:text-sky-300',
    thinking: 'text-amber-600 dark:text-amber-300',
    executing: 'text-cyan-600 dark:text-cyan-300',
    success: 'text-emerald-600 dark:text-emerald-300',
    error: 'text-rose-600 dark:text-rose-300'
}

function StatusIcon({
    tone,
    isActive
}: {
    tone: AgentStatusTone
    isActive: boolean
}) {
    switch (tone) {
        case 'thinking':
        case 'executing':
            return isActive ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
                <Clock3 className="h-4 w-4" />
            )
        case 'success':
            return <CheckCircle2 className="h-4 w-4" />
        case 'error':
            return <AlertCircle className="h-4 w-4" />
        case 'idle':
        case 'info':
        default:
            return <Sparkles className="h-4 w-4" />
    }
}

export default function StatusFeed({
    entries
}: {
    entries: AgentStatusEntry[]
}) {
    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {entries.length === 0 ? (
                <div className="rounded-[1.75rem] border border-[var(--surface-stroke)] bg-[var(--elevated-surface)] p-5 text-sm text-[var(--text-secondary)] shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)]">
                    O historico das ultimas execucoes aparecera aqui.
                </div>
            ) : null}

            <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
                {entries.map((entry, index) => (
                    <article
                        className={cn(
                            'rounded-[1.75rem] border p-4 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)] transition-colors',
                            toneStyles[entry.tone]
                        )}
                        key={entry.id}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div
                                    className={cn(
                                        'flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.28em]',
                                        toneLabelStyles[entry.tone]
                                    )}
                                >
                                    <StatusIcon
                                        isActive={index === 0}
                                        tone={entry.tone}
                                    />
                                    <span>{entry.title}</span>
                                    {entry.toolName ? (
                                        <span className="rounded-full border border-[var(--muted-chip-border)] bg-[var(--muted-chip-bg)] px-2 py-1 text-[10px] tracking-[0.2em] text-[var(--text-secondary)]">
                                            {entry.toolName}
                                        </span>
                                    ) : null}
                                </div>

                                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                                    {entry.detail}
                                </p>

                                {entry.request ? (
                                    <div className="mt-4 rounded-2xl border border-[var(--surface-stroke)] bg-[var(--input-surface)] px-4 py-3 text-xs leading-5 text-[var(--text-secondary)]">
                                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--text-tertiary)]">
                                            <MessageSquareDashed className="h-3.5 w-3.5" />
                                            Pedido
                                        </div>
                                        <p className="mt-2">{entry.request}</p>
                                    </div>
                                ) : null}
                            </div>

                            <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                                {formatStatusTime(entry.timestamp)}
                            </span>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    )
}
