import {
    Brain,
    ChevronLeft,
    KeyRound,
    ShieldCheck,
    Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DEFAULT_MAX_AGENT_TOOL_STEPS,
    GEMINI_MODEL_OPTIONS,
    LLM_PROVIDER_OPTIONS,
    MAX_AGENT_TOOL_STEPS_LIMIT,
    MIN_AGENT_TOOL_STEPS,
    MODAL_BASE_URL,
    MODAL_MODEL_OPTIONS,
    getGeminiModelLabel,
    getLLMProviderLabel,
    getModalModelLabel
} from '@/features/agent/constants'
import { maskApiKey } from '@/features/agent/utils'
import type { LLMProvider, SettingsFeedback } from '@/features/agent/types'

interface SettingsViewProps {
    backLabel?: string
    feedback: SettingsFeedback | null
    geminiApiKey: string
    geminiModelId: string
    isSaving: boolean
    maxAgentToolSteps: number
    modalApiKey: string
    modalModelId: string
    modalThinkingEnabled: boolean
    onBack: () => void
    onGeminiApiKeyChange: (value: string) => void
    onGeminiModelIdChange: (value: string) => void
    onMaxAgentToolStepsChange: (value: string) => void
    onModalApiKeyChange: (value: string) => void
    onModalModelIdChange: (value: string) => void
    onModalThinkingEnabledChange: (value: boolean) => void
    onProviderChange: (value: LLMProvider) => void
    onSave: () => void
    provider: LLMProvider
    visualOverlayEnabled: boolean
    onVisualOverlayEnabledChange: (value: boolean) => void
}

const feedbackToneClasses: Record<SettingsFeedback['tone'], string> = {
    idle: 'border-[var(--surface-stroke)] bg-[var(--input-surface)] text-[var(--text-secondary)]',
    success:
        'border-emerald-500/20 bg-emerald-500/10 text-[var(--text-secondary)]',
    error: 'border-rose-500/20 bg-rose-500/10 text-[var(--text-secondary)]'
}

const fieldClassName =
    'w-full rounded-[1.35rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] px-4 py-3.5 text-sm text-[var(--text-primary)] outline-none transition-shadow placeholder:text-[var(--placeholder)] focus:border-[var(--surface-stroke-strong)] focus:shadow-[0_0_0_4px_var(--focus-ring)]'

export default function SettingsView({
    backLabel = 'Voltar',
    feedback,
    geminiApiKey,
    geminiModelId,
    isSaving,
    maxAgentToolSteps,
    modalApiKey,
    modalModelId,
    modalThinkingEnabled,
    onBack,
    onGeminiApiKeyChange,
    onGeminiModelIdChange,
    onMaxAgentToolStepsChange,
    onModalApiKeyChange,
    onModalModelIdChange,
    onModalThinkingEnabledChange,
    onProviderChange,
    onSave,
    provider,
    visualOverlayEnabled,
    onVisualOverlayEnabledChange
}: SettingsViewProps) {
    const selectedProviderLabel = getLLMProviderLabel(provider)
    const normalizedGeminiApiKey = geminiApiKey.trim()
    const normalizedModalApiKey = modalApiKey.trim()
    const selectedGeminiModelLabel = getGeminiModelLabel(geminiModelId)
    const selectedModalModelLabel = getModalModelLabel(modalModelId)

    return (
        <section className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex shrink-0 items-center justify-between gap-4 px-1">
                <Button
                    className="h-10 rounded-[1.1rem] border border-[var(--surface-stroke)] bg-[var(--chrome-pill)] px-3.5 text-[var(--text-primary)] hover:bg-[var(--input-surface)]"
                    onClick={onBack}
                    type="button"
                    variant="ghost"
                >
                    <ChevronLeft className="h-4 w-4" />
                    {backLabel}
                </Button>

                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
                    Settings
                </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="rounded-[1.85rem] border border-[var(--surface-stroke)] bg-[var(--panel-background)] p-5 shadow-[0_30px_80px_-56px_rgba(15,23,42,0.42)] sm:p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.25rem] border border-[var(--surface-stroke)] bg-[var(--chrome-pill)] text-[var(--text-primary)]">
                            <KeyRound className="h-4 w-4" />
                        </div>

                        <div className="min-w-0">
                            <h2 className="text-[1.7rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                                Provider do agente
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                Escolha o provider ativo e salve a API Key do
                                runtime correspondente. Gemini e Modal ficam
                                persistidos separadamente.
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 space-y-3">
                        <label
                            className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]"
                            htmlFor="llm-provider"
                        >
                            Provider ativo
                        </label>
                        <select
                            className={fieldClassName}
                            id="llm-provider"
                            onChange={(event) =>
                                onProviderChange(
                                    event.target.value as LLMProvider
                                )
                            }
                            value={provider}
                        >
                            {LLM_PROVIDER_OPTIONS.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs leading-5 text-[var(--text-tertiary)]">
                            O agente executara os proximos comandos com{' '}
                            {selectedProviderLabel}.
                        </p>
                    </div>

                    <div className="mt-6 space-y-3">
                        <label
                            className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]"
                            htmlFor="max-agent-tool-steps"
                        >
                            Limite de passos
                        </label>
                        <input
                            className={fieldClassName}
                            id="max-agent-tool-steps"
                            inputMode="numeric"
                            max={MAX_AGENT_TOOL_STEPS_LIMIT}
                            min={MIN_AGENT_TOOL_STEPS}
                            onChange={(event) =>
                                onMaxAgentToolStepsChange(event.target.value)
                            }
                            placeholder={String(DEFAULT_MAX_AGENT_TOOL_STEPS)}
                            step={1}
                            type="number"
                            value={maxAgentToolSteps}
                        />
                        <p className="text-xs leading-5 text-[var(--text-tertiary)]">
                            Default {DEFAULT_MAX_AGENT_TOOL_STEPS}. Valores
                            entre {MIN_AGENT_TOOL_STEPS} e{' '}
                            {MAX_AGENT_TOOL_STEPS_LIMIT}. Limites maiores deixam
                            tarefas longas irem mais fundo, mas podem aumentar
                            latencia e custo.
                        </p>
                    </div>

                    <div className="mt-6 rounded-[1.35rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] p-4">
                        <label
                            className="flex cursor-pointer items-start gap-3"
                            htmlFor="visual-overlay-enabled"
                        >
                            <input
                                checked={visualOverlayEnabled}
                                className="mt-1 h-4 w-4 rounded border border-[var(--surface-stroke-strong)] accent-[var(--accent)]"
                                id="visual-overlay-enabled"
                                onChange={(event) =>
                                    onVisualOverlayEnabledChange(
                                        event.target.checked
                                    )
                                }
                                type="checkbox"
                            />

                            <span className="min-w-0">
                                <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                    <Sparkles className="h-4 w-4" />
                                    Highlight visual no navegador
                                </span>
                                <span className="mt-2 block text-sm leading-6 text-[var(--text-secondary)]">
                                    {visualOverlayEnabled
                                        ? 'Ligado. O browser mostra bordas e IDs no elemento que o agente acabou de usar.'
                                        : 'Desligado. O agente continua lendo os elementos semanticamente, sem desenhar a overlay de debug.'}
                                </span>
                            </span>
                        </label>
                    </div>

                    {provider === 'modal' ? (
                        <>
                            <div className="mt-6 space-y-3">
                                <label
                                    className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]"
                                    htmlFor="modal-api-key"
                                >
                                    Modal API Key
                                </label>
                                <input
                                    autoComplete="off"
                                    className={fieldClassName}
                                    id="modal-api-key"
                                    onChange={(event) =>
                                        onModalApiKeyChange(event.target.value)
                                    }
                                    placeholder="Cole aqui a sua Modal API Key"
                                    spellCheck={false}
                                    type="password"
                                    value={modalApiKey}
                                />
                                <p className="text-xs leading-5 text-[var(--text-tertiary)]">
                                    {normalizedModalApiKey.length > 0
                                        ? `Chave em memoria: ${maskApiKey(normalizedModalApiKey)}`
                                        : 'Nenhuma chave configurada ainda.'}
                                </p>
                            </div>

                            <div className="mt-6 space-y-3">
                                <label
                                    className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]"
                                    htmlFor="modal-model"
                                >
                                    Modelo Modal
                                </label>
                                <select
                                    className={fieldClassName}
                                    id="modal-model"
                                    onChange={(event) =>
                                        onModalModelIdChange(event.target.value)
                                    }
                                    value={modalModelId}
                                >
                                    {MODAL_MODEL_OPTIONS.map((option) => (
                                        <option
                                            key={option.id}
                                            value={option.id}
                                        >
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs leading-5 text-[var(--text-tertiary)]">
                                    Endpoint fixo do provider:{' '}
                                    <span className="font-medium text-[var(--text-secondary)]">
                                        {MODAL_BASE_URL}
                                    </span>
                                </p>
                            </div>

                            <div className="mt-6 rounded-[1.35rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] p-4">
                                <label
                                    className="flex cursor-pointer items-start gap-3"
                                    htmlFor="modal-thinking-enabled"
                                >
                                    <input
                                        checked={modalThinkingEnabled}
                                        className="mt-1 h-4 w-4 rounded border border-[var(--surface-stroke-strong)] accent-[var(--accent)]"
                                        id="modal-thinking-enabled"
                                        onChange={(event) =>
                                            onModalThinkingEnabledChange(
                                                event.target.checked
                                            )
                                        }
                                        type="checkbox"
                                    />

                                    <span className="min-w-0">
                                        <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                            <Brain className="h-4 w-4" />
                                            Thinking do GLM-5
                                        </span>
                                        <span className="mt-2 block text-sm leading-6 text-[var(--text-secondary)]">
                                            {modalThinkingEnabled
                                                ? 'Ligado. O modelo pode usar reasoning antes de responder.'
                                                : 'Desligado. O app enviara `thinking: { type: "disabled" }` para respostas mais diretas.'}
                                        </span>
                                    </span>
                                </label>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mt-6 space-y-3">
                                <label
                                    className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]"
                                    htmlFor="gemini-api-key"
                                >
                                    Gemini API Key
                                </label>
                                <input
                                    autoComplete="off"
                                    className={fieldClassName}
                                    id="gemini-api-key"
                                    onChange={(event) =>
                                        onGeminiApiKeyChange(event.target.value)
                                    }
                                    placeholder="Cole aqui a sua Gemini API Key"
                                    spellCheck={false}
                                    type="password"
                                    value={geminiApiKey}
                                />
                                <p className="text-xs leading-5 text-[var(--text-tertiary)]">
                                    {normalizedGeminiApiKey.length > 0
                                        ? `Chave em memoria: ${maskApiKey(normalizedGeminiApiKey)}`
                                        : 'Nenhuma chave configurada ainda.'}
                                </p>
                            </div>

                            <div className="mt-6 space-y-3">
                                <label
                                    className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]"
                                    htmlFor="gemini-model"
                                >
                                    Modelo Gemini
                                </label>
                                <select
                                    className={fieldClassName}
                                    id="gemini-model"
                                    onChange={(event) =>
                                        onGeminiModelIdChange(
                                            event.target.value
                                        )
                                    }
                                    value={geminiModelId}
                                >
                                    {GEMINI_MODEL_OPTIONS.map((option) => (
                                        <option
                                            key={option.id}
                                            value={option.id}
                                        >
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs leading-5 text-[var(--text-tertiary)]">
                                    O agente executara os proximos comandos com{' '}
                                    {selectedGeminiModelLabel}.
                                </p>
                            </div>
                        </>
                    )}

                    <div className="mt-6 grid gap-3 xl:grid-cols-2">
                        <div className="rounded-[1.35rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                <Sparkles className="h-4 w-4" />
                                Runtime ativo
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                {provider === 'modal'
                                    ? `${selectedProviderLabel} com ${selectedModalModelLabel} em ${MODAL_BASE_URL}, thinking ${modalThinkingEnabled ? 'ligado' : 'desligado'}.`
                                    : `${selectedProviderLabel} com ${selectedGeminiModelLabel}.`}{' '}
                                Limite atual: {maxAgentToolSteps} etapas.
                                Overlay{' '}
                                {visualOverlayEnabled
                                    ? ' ligada.'
                                    : ' desligada.'}
                            </p>
                        </div>

                        <div className="rounded-[1.35rem] border border-[var(--surface-stroke)] bg-[var(--input-surface)] p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                <ShieldCheck className="h-4 w-4" />
                                Tools web
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                `web_navigate`, `web_snapshot`,
                                `web_click_and_wait`, `web_type_and_submit`,
                                `web_wait_for_navigation`, `web_wait_for_url`,
                                `web_wait_for_text`, `web_wait_for_element`,
                                `web_wait_for_results_change`
                            </p>
                        </div>
                    </div>

                    {feedback ? (
                        <div
                            className={`mt-6 rounded-[1.35rem] border px-4 py-3 text-sm leading-6 ${feedbackToneClasses[feedback.tone]}`}
                        >
                            {feedback.message}
                        </div>
                    ) : null}

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                            Persistencia desktop via Tauri plugin-store
                        </p>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button
                                className="h-10 rounded-[1.1rem] border border-[var(--surface-stroke)] bg-[var(--chrome-pill)] px-4 text-[var(--text-primary)] hover:bg-[var(--input-surface)]"
                                onClick={onBack}
                                type="button"
                                variant="ghost"
                            >
                                Fechar
                            </Button>

                            <Button
                                className="h-10 rounded-[1.1rem] bg-[var(--accent)] px-4 text-[var(--accent-contrast)] shadow-[0_20px_52px_-30px_rgba(15,23,42,0.6)] hover:opacity-92"
                                disabled={isSaving}
                                onClick={onSave}
                                type="button"
                            >
                                {isSaving
                                    ? 'Salvando...'
                                    : 'Salvar configuracoes'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
