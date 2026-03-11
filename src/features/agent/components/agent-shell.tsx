import { AnimatePresence, motion } from 'framer-motion'
import { startTransition, useEffect, useState } from 'react'
import {
    DEFAULT_GEMINI_MODEL_ID,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_MODAL_MODEL_ID,
    DEFAULT_MODAL_THINKING_ENABLED
} from '@/features/agent/constants'
import MainView from '@/features/agent/components/main-view'
import SettingsView from '@/features/agent/components/settings-view'
import WindowChrome from '@/features/agent/components/window-chrome'
import { resetBrowserAgentSession } from '@/features/agent/services/desktop-actions'
import {
    getActiveModelLabel,
    getActiveProviderLabel,
    isProviderConfigured,
    runAgentCommand
} from '@/features/agent/services/llm-service'
import {
    loadLLMSettings,
    saveLLMSettings
} from '@/features/agent/services/settings-store'
import type {
    AgentExecutionStatus,
    AgentLLMSettings,
    AgentStatusEntry,
    AgentView,
    LLMProvider,
    SettingsFeedback
} from '@/features/agent/types'
import {
    createStatusEntry,
    getErrorMessage,
    prependStatusEntry
} from '@/features/agent/utils'

const panelTransition = {
    duration: 0.24,
    ease: [0.22, 1, 0.36, 1] as const
}

const DEFAULT_SETTINGS: AgentLLMSettings = {
    provider: DEFAULT_LLM_PROVIDER,
    geminiApiKey: '',
    geminiModelId: DEFAULT_GEMINI_MODEL_ID,
    modalApiKey: '',
    modalModelId: DEFAULT_MODAL_MODEL_ID,
    modalThinkingEnabled: DEFAULT_MODAL_THINKING_ENABLED
}

function getConfigurationLabel(settings: AgentLLMSettings) {
    return isProviderConfigured(settings)
        ? 'API Key configurada'
        : 'API Key pendente'
}

function buildInitialStatus(settings: AgentLLMSettings): AgentStatusEntry {
    const providerLabel = getActiveProviderLabel(settings)
    const modelLabel = getActiveModelLabel(settings)

    if (isProviderConfigured(settings)) {
        return createStatusEntry({
            tone: 'success',
            title: 'Agente pronto',
            detail: `${providerLabel} ativo com ${modelLabel}.`
        })
    }

    return createStatusEntry({
        tone: 'info',
        title: `${providerLabel} ainda nao configurado`,
        detail: `Abra Settings e salve sua API Key para habilitar a navegacao web assistida com ${modelLabel}.`
    })
}

export default function AgentShell() {
    const [activeView, setActiveView] = useState<AgentView>('main')
    const [command, setCommand] = useState('')
    const [settings, setSettings] = useState<AgentLLMSettings>(DEFAULT_SETTINGS)
    const [settingsDraft, setSettingsDraft] =
        useState<AgentLLMSettings>(DEFAULT_SETTINGS)
    const [statusEntries, setStatusEntries] = useState<AgentStatusEntry[]>([])
    const [settingsFeedback, setSettingsFeedback] =
        useState<SettingsFeedback | null>(null)
    const [isBootstrapping, setIsBootstrapping] = useState(true)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const activeProviderLabel = getActiveProviderLabel(settings)
    const activeModelLabel = getActiveModelLabel(settings)
    const isConfigured = isProviderConfigured(settings)
    const configurationLabel = getConfigurationLabel(settings)

    useEffect(() => {
        let isMounted = true

        async function bootstrap() {
            try {
                const loadedSettings = await loadLLMSettings()

                if (!isMounted) {
                    return
                }

                setSettings(loadedSettings)
                setSettingsDraft(loadedSettings)
                setStatusEntries([buildInitialStatus(loadedSettings)])
            } catch (error) {
                if (!isMounted) {
                    return
                }

                setStatusEntries([
                    createStatusEntry({
                        tone: 'error',
                        title: 'Falha ao carregar configuracoes',
                        detail: getErrorMessage(error)
                    })
                ])
            } finally {
                if (isMounted) {
                    setIsBootstrapping(false)
                }
            }
        }

        void bootstrap()

        return () => {
            isMounted = false
        }
    }, [])

    useEffect(() => {
        return () => {
            void resetBrowserAgentSession()
        }
    }, [])

    function pushStatus(nextEntry: AgentStatusEntry) {
        setStatusEntries((currentEntries) =>
            prependStatusEntry(currentEntries, nextEntry)
        )
    }

    function pushRuntimeStatus(status: AgentExecutionStatus) {
        pushStatus(
            createStatusEntry({
                tone: status.tone,
                title: status.title,
                detail: status.detail,
                toolName: status.toolName
            })
        )
    }

    function openSettings() {
        setSettingsFeedback(null)
        setSettingsDraft(settings)
        startTransition(() => setActiveView('settings'))
    }

    function closeSettings() {
        startTransition(() => setActiveView('main'))
    }

    function handleProviderDraftChange(provider: LLMProvider) {
        setSettingsDraft((current) => ({
            ...current,
            provider
        }))
        setSettingsFeedback(null)
    }

    async function handleSaveSettings() {
        if (isSavingSettings) {
            return
        }

        setIsSavingSettings(true)
        setSettingsFeedback(null)

        try {
            const savedSettings = await saveLLMSettings(settingsDraft)
            const savedProviderLabel = getActiveProviderLabel(savedSettings)
            const savedModelLabel = getActiveModelLabel(savedSettings)
            const nextConfigured = isProviderConfigured(savedSettings)

            setSettings(savedSettings)
            setSettingsDraft(savedSettings)
            setSettingsFeedback({
                tone: 'success',
                message: nextConfigured
                    ? `Configuracoes salvas com sucesso. ${savedProviderLabel} ativo com ${savedModelLabel}.`
                    : `${savedProviderLabel} salvo com ${savedModelLabel}. API Key pendente.`
            })

            pushStatus(buildInitialStatus(savedSettings))
        } catch (error) {
            setSettingsFeedback({
                tone: 'error',
                message: getErrorMessage(error)
            })

            pushStatus(
                createStatusEntry({
                    tone: 'error',
                    title: 'Falha ao salvar configuracoes',
                    detail: getErrorMessage(error)
                })
            )
        } finally {
            setIsSavingSettings(false)
        }
    }

    async function handleSubmitCommand() {
        const trimmedCommand = command.trim()

        if (trimmedCommand.length === 0 || isBootstrapping || isSubmitting) {
            return
        }

        if (!isConfigured) {
            pushStatus(
                createStatusEntry({
                    tone: 'info',
                    title: 'Configuracao obrigatoria',
                    detail: `Salve sua API Key do ${activeProviderLabel} antes de executar comandos.`,
                    request: trimmedCommand
                })
            )
            openSettings()
            return
        }

        setIsSubmitting(true)

        pushStatus(
            createStatusEntry({
                tone: 'thinking',
                title: 'Pensando...',
                detail: `Planejando a navegacao com ${activeProviderLabel} (${activeModelLabel}).`,
                request: trimmedCommand
            })
        )

        try {
            const result = await runAgentCommand(
                trimmedCommand,
                settings,
                pushRuntimeStatus
            )

            pushStatus(
                createStatusEntry({
                    tone: 'success',
                    title: 'Tarefa concluida',
                    detail: result.message,
                    request: trimmedCommand
                })
            )

            setCommand('')
            closeSettings()
        } catch (error) {
            pushStatus(
                createStatusEntry({
                    tone: 'error',
                    title: 'Falha na execucao',
                    detail: getErrorMessage(error),
                    request: trimmedCommand
                })
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <main className="relative min-h-screen overflow-hidden bg-[var(--window-fill)] text-[var(--text-primary)]">
            <section className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--window-fill)] p-4 sm:p-5">
                <WindowChrome />

                <div className="mt-4 min-h-0 flex-1 overflow-hidden">
                    <AnimatePresence mode="wait">
                        <motion.div
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            className="h-full min-h-0"
                            exit={{ opacity: 0, y: -12, filter: 'blur(8px)' }}
                            initial={{
                                opacity: 0,
                                y: 18,
                                filter: 'blur(12px)'
                            }}
                            key={activeView}
                            transition={panelTransition}
                        >
                            {activeView === 'main' ? (
                                <MainView
                                    command={command}
                                    configurationLabel={configurationLabel}
                                    isBootstrapping={isBootstrapping}
                                    isConfigured={isConfigured}
                                    isSubmitting={isSubmitting}
                                    modelLabel={activeModelLabel}
                                    onCommandChange={setCommand}
                                    onOpenSettings={openSettings}
                                    onSubmit={() => void handleSubmitCommand()}
                                    providerLabel={activeProviderLabel}
                                    statusEntries={statusEntries}
                                />
                            ) : (
                                <SettingsView
                                    feedback={settingsFeedback}
                                    geminiApiKey={settingsDraft.geminiApiKey}
                                    geminiModelId={settingsDraft.geminiModelId}
                                    isSaving={isSavingSettings}
                                    modalApiKey={settingsDraft.modalApiKey}
                                    modalModelId={settingsDraft.modalModelId}
                                    modalThinkingEnabled={
                                        settingsDraft.modalThinkingEnabled
                                    }
                                    onBack={closeSettings}
                                    onGeminiApiKeyChange={(value) =>
                                        setSettingsDraft((current) => ({
                                            ...current,
                                            geminiApiKey: value
                                        }))
                                    }
                                    onGeminiModelIdChange={(value) =>
                                        setSettingsDraft((current) => ({
                                            ...current,
                                            geminiModelId: value
                                        }))
                                    }
                                    onModalApiKeyChange={(value) =>
                                        setSettingsDraft((current) => ({
                                            ...current,
                                            modalApiKey: value
                                        }))
                                    }
                                    onModalModelIdChange={(value) =>
                                        setSettingsDraft((current) => ({
                                            ...current,
                                            modalModelId: value
                                        }))
                                    }
                                    onModalThinkingEnabledChange={(value) =>
                                        setSettingsDraft((current) => ({
                                            ...current,
                                            modalThinkingEnabled: value
                                        }))
                                    }
                                    onProviderChange={handleProviderDraftChange}
                                    onSave={() => void handleSaveSettings()}
                                    provider={settingsDraft.provider}
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </section>
        </main>
    )
}
