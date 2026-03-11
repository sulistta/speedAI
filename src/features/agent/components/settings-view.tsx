import { ChevronLeft, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GEMINI_MODEL_LABEL } from '@/features/agent/constants'
import { maskApiKey } from '@/features/agent/utils'
import type { SettingsFeedback } from '@/features/agent/types'

interface SettingsViewProps {
    apiKey: string
    feedback: SettingsFeedback | null
    isSaving: boolean
    onApiKeyChange: (value: string) => void
    onBack: () => void
    onSave: () => void
}

const feedbackToneClasses: Record<SettingsFeedback['tone'], string> = {
    idle: 'border-[var(--surface-stroke)] bg-[var(--input-surface)] text-[var(--text-secondary)]',
    success:
        'border-emerald-500/25 bg-emerald-500/10 text-[var(--text-secondary)]',
    error: 'border-rose-500/25 bg-rose-500/10 text-[var(--text-secondary)]'
}

export default function SettingsView({
    apiKey,
    feedback,
    isSaving,
    onApiKeyChange,
    onBack,
    onSave
}: SettingsViewProps) {
    const normalizedApiKey = apiKey.trim()

    return (
        <section className="flex h-full min-h-0 flex-col gap-5">
            <div className="flex shrink-0 items-center justify-between gap-4">
                <Button
                    className="h-11 rounded-2xl border border-[var(--surface-stroke)] bg-[var(--elevated-surface)] px-4 text-[var(--text-primary)] hover:bg-[var(--input-surface)]"
                    onClick={onBack}
                    type="button"
                    variant="ghost"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Voltar
                </Button>

                <div className="rounded-full border border-[var(--muted-chip-border)] bg-[var(--muted-chip-bg)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--text-tertiary)]">
                    Settings
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="rounded-[2rem] border border-[var(--surface-stroke)] bg-[var(--elevated-surface)] p-5 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)] sm:p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--surface-stroke)] bg-[var(--input-surface)] text-[var(--text-primary)]">
                            <KeyRound className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                                Credenciais do Gemini
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                A chave fica persistida no plugin-store do Tauri
                                e habilita o loop de navegacao web do agente.
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 space-y-3">
                        <label
                            className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]"
                            htmlFor="gemini-api-key"
                        >
                            API Key
                        </label>
                        <input
                            autoComplete="off"
                            className="w-full rounded-[1.5rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] px-4 py-4 text-sm text-[var(--text-primary)] outline-none transition-shadow placeholder:text-[var(--placeholder)] focus:border-[var(--surface-stroke-strong)] focus:shadow-[0_0_0_4px_var(--focus-ring)]"
                            id="gemini-api-key"
                            onChange={(event) =>
                                onApiKeyChange(event.target.value)
                            }
                            placeholder="Cole aqui a sua Gemini API Key"
                            spellCheck={false}
                            type="password"
                            value={apiKey}
                        />
                        <p className="text-xs leading-5 text-[var(--text-tertiary)]">
                            {normalizedApiKey.length > 0
                                ? `Chave em memoria: ${maskApiKey(normalizedApiKey)}`
                                : 'Nenhuma chave configurada ainda.'}
                        </p>
                    </div>

                    <div className="mt-6 grid gap-3 xl:grid-cols-2">
                        <div className="rounded-[1.5rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                <Sparkles className="h-4 w-4" />
                                Modelo fixo
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                {GEMINI_MODEL_LABEL}, mantido fixo no MVP para
                                reduzir variacao de latencia.
                            </p>
                        </div>

                        <div className="rounded-[1.5rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                <ShieldCheck className="h-4 w-4" />
                                Tools web
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                `web_navigate`, `web_snapshot`, `web_click`,
                                `web_type`, `web_press`, `web_wait`,
                                `web_scroll`
                            </p>
                        </div>
                    </div>

                    {feedback ? (
                        <div
                            className={`mt-6 rounded-[1.5rem] border px-4 py-3 text-sm leading-6 ${feedbackToneClasses[feedback.tone]}`}
                        >
                            {feedback.message}
                        </div>
                    ) : null}

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
                            Persistencia desktop via Tauri plugin-store
                        </p>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button
                                className="h-11 rounded-2xl border border-[var(--surface-stroke)] bg-[var(--input-surface)] px-5 text-[var(--text-primary)] hover:bg-[var(--muted-chip-bg)]"
                                onClick={onBack}
                                type="button"
                                variant="ghost"
                            >
                                Fechar
                            </Button>

                            <Button
                                className="h-11 rounded-2xl bg-[var(--accent)] px-5 text-[var(--accent-contrast)] hover:opacity-92"
                                disabled={isSaving}
                                onClick={onSave}
                                type="button"
                            >
                                {isSaving ? 'Salvando...' : 'Salvar chave'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
