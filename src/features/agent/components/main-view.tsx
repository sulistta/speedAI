import type { KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StatusSurface from '@/features/agent/components/status-surface'
import type { AgentStatusEntry } from '@/features/agent/types'
import { cn } from '@/lib/utils'

interface MainViewProps {
    command: string
    configurationLabel: string
    currentRequest: string
    isBootstrapping: boolean
    isConfigured: boolean
    isSubmitting: boolean
    modelLabel: string
    onCommandChange: (value: string) => void
    onOpenSettings: () => void
    onSubmit: () => void
    providerLabel: string
    statusEntry: AgentStatusEntry | null
}

const surfaceTransition = {
    duration: 0.22,
    ease: [0.22, 1, 0.36, 1] as const
}

const statusTextToneStyles = {
    idle: 'text-[var(--text-tertiary)]',
    info: 'text-sky-600 dark:text-sky-300',
    thinking: 'text-amber-600 dark:text-amber-300',
    executing: 'text-cyan-600 dark:text-cyan-300',
    success: 'text-emerald-600 dark:text-emerald-300',
    error: 'text-rose-600 dark:text-rose-300'
} as const

export default function MainView({
    command,
    configurationLabel,
    currentRequest,
    isBootstrapping,
    isConfigured,
    isSubmitting,
    modelLabel,
    onCommandChange,
    onOpenSettings,
    onSubmit,
    providerLabel,
    statusEntry
}: MainViewProps) {
    const isBusy = isBootstrapping || isSubmitting
    const showExecutionSurface = isBusy
    const helperCopy = statusEntry
        ? `${statusEntry.title}. ${statusEntry.detail}`
        : 'Enter envia. Shift+Enter quebra linha.'

    function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
        }
    }

    return (
        <section className="flex h-full min-h-0 items-center justify-center">
            <div className="flex w-full max-w-[760px] flex-col gap-4">
                <div className="flex items-end gap-3 sm:gap-4">
                    <Button
                        aria-label="Abrir configuracoes"
                        className={cn(
                            'h-10 w-10 shrink-0 rounded-[1.15rem] border border-[var(--surface-stroke)] bg-[var(--chrome-pill)] text-[var(--text-primary)] shadow-[0_18px_40px_-34px_rgba(15,23,42,0.55)] hover:bg-[var(--input-surface)]',
                            !isConfigured &&
                                'border-[var(--surface-stroke-strong)]'
                        )}
                        onClick={onOpenSettings}
                        size="icon"
                        type="button"
                        variant="ghost"
                    >
                        <Settings2 className="h-4 w-4" />
                    </Button>

                    <div className="min-w-0 flex-1">
                        <AnimatePresence initial={false} mode="wait">
                            {showExecutionSurface ? (
                                <motion.div
                                    animate={{
                                        opacity: 1,
                                        y: 0,
                                        filter: 'blur(0px)'
                                    }}
                                    exit={{
                                        opacity: 0,
                                        y: -8,
                                        filter: 'blur(10px)'
                                    }}
                                    initial={{
                                        opacity: 0,
                                        y: 12,
                                        filter: 'blur(12px)'
                                    }}
                                    key="status-surface"
                                    transition={surfaceTransition}
                                >
                                    <StatusSurface
                                        entry={statusEntry}
                                        isActive={isBusy}
                                        request={currentRequest}
                                    />
                                </motion.div>
                            ) : (
                                <motion.div
                                    animate={{
                                        opacity: 1,
                                        y: 0,
                                        filter: 'blur(0px)'
                                    }}
                                    className="relative"
                                    exit={{
                                        opacity: 0,
                                        y: 8,
                                        filter: 'blur(10px)'
                                    }}
                                    initial={{
                                        opacity: 0,
                                        y: 12,
                                        filter: 'blur(12px)'
                                    }}
                                    key="command-input"
                                    transition={surfaceTransition}
                                >
                                    <label
                                        className="sr-only"
                                        htmlFor="agent-command-input"
                                    >
                                        Comando do agente
                                    </label>

                                    <textarea
                                        className="min-h-[116px] max-h-44 w-full overflow-y-auto rounded-[1.7rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] px-5 py-5 pr-20 text-[1rem] leading-7 text-[var(--text-primary)] shadow-[0_28px_70px_-46px_rgba(15,23,42,0.42)] outline-none transition-[border-color,box-shadow,background] placeholder:text-[var(--placeholder)] focus:border-[var(--surface-stroke-strong)] focus:shadow-[0_0_0_4px_var(--focus-ring)] sm:text-[1.08rem]"
                                        disabled={isBusy}
                                        id="agent-command-input"
                                        onChange={(event) =>
                                            onCommandChange(event.target.value)
                                        }
                                        onKeyDown={handleTextareaKeyDown}
                                        placeholder="Peça uma ação para o agente."
                                        rows={3}
                                        value={command}
                                    />

                                    <Button
                                        aria-label="Executar comando"
                                        className="absolute bottom-3.5 right-3.5 h-11 w-11 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_20px_55px_-28px_rgba(15,23,42,0.72)] hover:opacity-92"
                                        disabled={
                                            isBusy ||
                                            command.trim().length === 0
                                        }
                                        onClick={onSubmit}
                                        size="icon"
                                        type="button"
                                    >
                                        <ArrowUpRight className="h-4 w-4" />
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="flex flex-col gap-1 px-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <p
                        className={cn(
                            'text-xs leading-5',
                            statusEntry
                                ? statusTextToneStyles[statusEntry.tone]
                                : statusTextToneStyles.idle
                        )}
                    >
                        {helperCopy}
                    </p>

                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                        {providerLabel} · {modelLabel} · {configurationLabel}
                    </p>
                </div>
            </div>
        </section>
    )
}
