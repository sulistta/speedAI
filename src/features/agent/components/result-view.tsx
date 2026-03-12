import { motion } from 'framer-motion'
import { ArrowLeft, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StatusSurface from '@/features/agent/components/status-surface'
import type {
    AgentResultSummary,
    AgentStatusEntry
} from '@/features/agent/types'
import { formatStatusTime } from '@/features/agent/utils'

interface ResultViewProps {
    summary: AgentResultSummary | null
    onNewTask: () => void
}

export default function ResultView({ summary, onNewTask }: ResultViewProps) {
    const actionEntries = summary?.entries.slice(0, -1) ?? []
    const lastEntry =
        summary?.entries !== undefined && summary.entries.length > 0
            ? summary.entries[summary.entries.length - 1]
            : undefined
    const statusEntry: AgentStatusEntry | null = summary
        ? {
              id: summary.id,
              timestamp: summary.timestamp,
              tone: summary.tone,
              title: summary.title,
              detail: summary.detail,
              request: summary.request,
              toolName: lastEntry?.toolName
          }
        : null

    return (
        <section className="flex h-full min-h-0 justify-center">
            <div className="flex h-full w-full max-w-[760px] flex-col gap-4 overflow-y-auto px-1 pb-2 pt-5">
                <motion.div
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    initial={{ opacity: 0, y: 16, filter: 'blur(12px)' }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                    {statusEntry ? (
                        <StatusSurface
                            entry={statusEntry}
                            isActive={false}
                            request={summary?.request}
                        />
                    ) : (
                        <div className="flex min-h-[156px] items-center rounded-[1.65rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] px-5 py-4 text-sm text-[var(--text-secondary)]">
                            O resumo da tarefa aparecera aqui quando a execucao
                            for concluida.
                        </div>
                    )}
                </motion.div>

                <div className="flex flex-col gap-1 px-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2 text-xs leading-5 text-[var(--text-secondary)]">
                        <Clock3 className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                        {summary
                            ? `Resultado registrado as ${formatStatusTime(summary.timestamp)}.`
                            : 'Nenhum resultado recente disponivel.'}
                    </p>

                    {summary ? (
                        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                            {summary.providerLabel} · {summary.modelLabel}
                        </p>
                    ) : null}
                </div>

                {actionEntries.length > 0 ? (
                    <div className="flex flex-col gap-3">
                        <div className="px-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                                Acoes executadas
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            {actionEntries.map((entry) => (
                                <StatusSurface
                                    entry={entry}
                                    isActive={false}
                                    key={entry.id}
                                />
                            ))}
                        </div>
                    </div>
                ) : null}

                <Button
                    className="mt-1 h-11 self-start rounded-full bg-[var(--accent)] px-5 text-[var(--accent-contrast)] shadow-[0_20px_55px_-28px_rgba(15,23,42,0.72)] hover:opacity-92"
                    onClick={onNewTask}
                    type="button"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Nova tarefa
                </Button>
            </div>
        </section>
    )
}
