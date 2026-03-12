import {
    AlertCircle,
    CheckCircle2,
    LoaderCircle,
    Sparkles,
    Wrench
} from 'lucide-react'
import { motion } from 'framer-motion'
import type { AgentStatusEntry, AgentStatusTone } from '@/features/agent/types'
import { cn } from '@/lib/utils'

const toneStyles: Record<AgentStatusTone, string> = {
    idle: 'border-[var(--surface-stroke)] bg-[var(--input-surface)] text-[var(--text-secondary)]',
    info: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-200',
    thinking:
        'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200',
    executing:
        'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200',
    success:
        'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    error: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-200'
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
                <Sparkles className="h-4 w-4" />
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

interface StatusSurfaceProps {
    entry: AgentStatusEntry | null
    isActive: boolean
    request?: string
}

export default function StatusSurface({
    entry,
    isActive,
    request
}: StatusSurfaceProps) {
    if (!entry) {
        return (
            <div className="flex min-h-[116px] items-center rounded-[1.65rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] px-5 py-4 text-sm text-[var(--text-secondary)]">
                O agente exibira a acao atual aqui durante a execucao.
            </div>
        )
    }

    return (
        <motion.article
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cn(
                'min-h-[116px] rounded-[1.65rem] border px-5 py-4 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.45)]',
                toneStyles[entry.tone]
            )}
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            key={entry.id}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em]">
                        <StatusIcon isActive={isActive} tone={entry.tone} />
                        <span className="truncate">{entry.title}</span>
                        {entry.toolName ? (
                            <span className="rounded-full border border-current/12 bg-white/40 px-2 py-1 text-[10px] tracking-[0.16em] text-current dark:bg-black/10">
                                {entry.toolName}
                            </span>
                        ) : null}
                    </div>

                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                        {entry.detail}
                    </p>

                    {request ? (
                        <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]">
                            <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                            <p className="line-clamp-2">{request}</p>
                        </div>
                    ) : null}
                </div>
            </div>
        </motion.article>
    )
}
