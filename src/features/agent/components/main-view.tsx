import type { KeyboardEvent } from 'react'
import { ArrowUpRight, Settings2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StatusFeed from '@/features/agent/components/status-feed'
import type { AgentStatusEntry } from '@/features/agent/types'
import { cn } from '@/lib/utils'

interface MainViewProps {
    command: string
    configurationLabel: string
    isBootstrapping: boolean
    isConfigured: boolean
    isSubmitting: boolean
    modelLabel: string
    onCommandChange: (value: string) => void
    onOpenSettings: () => void
    onSubmit: () => void
    providerLabel: string
    statusEntries: AgentStatusEntry[]
}

export default function MainView({
    command,
    configurationLabel,
    isBootstrapping,
    isConfigured,
    isSubmitting,
    modelLabel,
    onCommandChange,
    onOpenSettings,
    onSubmit,
    providerLabel,
    statusEntries
}: MainViewProps) {
    const isBusy = isBootstrapping || isSubmitting

    function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
        }
    }

    return (
        <section className="flex h-full min-h-0 flex-col gap-5">
            <div className="flex shrink-0 items-start justify-between gap-4">
                <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--muted-chip-border)] bg-[var(--muted-chip-bg)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.3em] text-[var(--text-tertiary)]">
                        <Sparkles className="h-3.5 w-3.5" />
                        SpeedAI Agent
                    </div>
                </div>

                <Button
                    aria-label="Abrir configuracoes"
                    className={cn(
                        'h-12 w-12 rounded-2xl border border-[var(--surface-stroke)] bg-[var(--elevated-surface)] text-[var(--text-primary)] shadow-[0_14px_36px_-28px_rgba(15,23,42,0.45)] hover:bg-[var(--input-surface)]',
                        !isConfigured && 'border-[var(--surface-stroke-strong)]'
                    )}
                    onClick={onOpenSettings}
                    size="icon"
                    variant="ghost"
                >
                    <Settings2 className="h-5 w-5" />
                </Button>
            </div>

            <div className="shrink-0 rounded-[2rem] border border-[var(--surface-stroke)] bg-[var(--elevated-surface)] p-4 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)] sm:p-5">
                <label className="sr-only" htmlFor="agent-command-input">
                    Comando do agente
                </label>

                <textarea
                    className="min-h-28 max-h-44 w-full overflow-y-auto rounded-[1.6rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] px-4 py-4 text-[1.05rem] leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--placeholder)] focus:border-[var(--surface-stroke-strong)] focus:shadow-[0_0_0_4px_var(--focus-ring)] sm:text-[1.12rem]"
                    disabled={isBusy}
                    id="agent-command-input"
                    onChange={(event) => onCommandChange(event.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder="Ex.: abra a documentacao do Bun, encontre como instalar dependencias e me resuma os passos"
                    rows={3}
                    value={command}
                />

                <div className="mt-4 flex flex-col gap-3 border-t border-[var(--surface-stroke)] px-1 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span className="rounded-full border border-[var(--muted-chip-border)] bg-[var(--muted-chip-bg)] px-3 py-1.5 font-medium">
                            {providerLabel}
                        </span>
                        <span className="rounded-full border border-[var(--muted-chip-border)] bg-[var(--muted-chip-bg)] px-3 py-1.5 font-medium">
                            {modelLabel}
                        </span>
                        <span className="rounded-full border border-[var(--muted-chip-border)] bg-[var(--muted-chip-bg)] px-3 py-1.5 font-medium">
                            {configurationLabel}
                        </span>
                        <span className="text-[var(--text-tertiary)]">
                            Enter envia, Shift+Enter quebra linha.
                        </span>
                    </div>

                    <Button
                        className="h-11 rounded-2xl bg-[var(--accent)] px-5 text-sm font-medium text-[var(--accent-contrast)] shadow-[0_22px_50px_-30px_rgba(15,23,42,0.75)] hover:opacity-92"
                        disabled={isBusy || command.trim().length === 0}
                        onClick={onSubmit}
                        type="button"
                    >
                        <ArrowUpRight className="h-4 w-4" />
                        {isSubmitting ? 'Executando...' : 'Executar'}
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
                <StatusFeed entries={statusEntries} />
            </div>
        </section>
    )
}
