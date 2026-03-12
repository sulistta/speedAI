import { AnimatePresence, motion } from 'framer-motion'
import { startTransition, useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { isTauri } from '@tauri-apps/api/core'
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
import {
    SETTINGS_UPDATED_EVENT,
    isSettingsWindowContext,
    notifySettingsUpdated,
    openSettingsWindow
} from '@/features/agent/services/settings-window'
import { closeCurrentWindow } from '@/features/agent/services/window-controls'
import type {
    AgentExecutionStatus,
    AgentLLMSettings,
    AgentStatusEntry,
    AgentView,
    LLMProvider,
    SettingsFeedback
} from '@/features/agent/types'
import { createStatusEntry, getErrorMessage } from '@/features/agent/utils'
import { cn } from '@/lib/utils'

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
    const isSettingsWindow = isSettingsWindowContext()
    const [activeView, setActiveView] = useState<AgentView>(
        isSettingsWindow ? 'settings' : 'main'
    )
    const [command, setCommand] = useState('')
    const [settings, setSettings] = useState<AgentLLMSettings>(DEFAULT_SETTINGS)
    const [settingsDraft, setSettingsDraft] =
        useState<AgentLLMSettings>(DEFAULT_SETTINGS)
    const [activeStatus, setActiveStatus] = useState<AgentStatusEntry | null>(
        null
    )
    const [currentRequest, setCurrentRequest] = useState('')
    const [settingsFeedback, setSettingsFeedback] =
        useState<SettingsFeedback | null>(null)
    const [isBootstrapping, setIsBootstrapping] = useState(true)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const activeProviderLabel = getActiveProviderLabel(settings)
    const activeModelLabel = getActiveModelLabel(settings)
    const isConfigured = isProviderConfigured(settings)
    const configurationLabel = getConfigurationLabel(settings)
    const renderedView: AgentView = isSettingsWindow ? 'settings' : activeView

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
                setActiveStatus(buildInitialStatus(loadedSettings))
            } catch (error) {
                if (!isMounted) {
                    return
                }

                setActiveStatus(
                    createStatusEntry({
                        tone: 'error',
                        title: 'Falha ao carregar configuracoes',
                        detail: getErrorMessage(error)
                    })
                )
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

    useEffect(() => {
        if (isSettingsWindow || !isTauri()) {
            return
        }

        let unlisten: (() => void) | null = null

        void listen<AgentLLMSettings>(SETTINGS_UPDATED_EVENT, ({ payload }) => {
            setSettings(payload)
            setSettingsDraft(payload)

            if (!isSubmitting) {
                setActiveStatus(buildInitialStatus(payload))
            }
        }).then((removeListener) => {
            unlisten = removeListener
        })

        return () => {
            unlisten?.()
        }
    }, [isSettingsWindow, isSubmitting])

    function pushStatus(nextEntry: AgentStatusEntry) {
        setActiveStatus(nextEntry)
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

    async function openSettings() {
        if (isSettingsWindow) {
            return
        }

        if (await openSettingsWindow()) {
            return
        }

        setSettingsFeedback(null)
        setSettingsDraft(settings)
        startTransition(() => setActiveView('settings'))
    }

    function closeSettings() {
        if (isSettingsWindow && isTauri()) {
            void closeCurrentWindow()
            return
        }

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
            await notifySettingsUpdated(savedSettings)
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
            void openSettings()
            return
        }

        setIsSubmitting(true)
        setCurrentRequest(trimmedCommand)

        pushStatus(
            createStatusEntry({
                tone: 'thinking',
                title: 'Pensando',
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
            if (!isSettingsWindow) {
                closeSettings()
            }
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
            setCurrentRequest('')
        }
    }

    return (
        <main className="min-h-screen overflow-hidden px-3 py-3 text-[var(--text-primary)] sm:px-5 sm:py-5">
            <section
                className={cn(
                    'relative mx-auto flex h-[calc(100vh-1.5rem)] w-full flex-col sm:h-[calc(100vh-2.5rem)]',
                    isSettingsWindow
                        ? 'max-w-[960px] overflow-hidden rounded-[2rem] border border-[var(--surface-stroke)] bg-[var(--window-surface)] shadow-[var(--window-shadow)] backdrop-blur-[28px]'
                        : 'max-w-[940px]'
                )}
            >
                <WindowChrome
                    title={
                        isSettingsWindow
                            ? 'SpeedAI Settings'
                            : 'SpeedAI Desktop Agent'
                    }
                />

                <div className="min-h-0 flex-1 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
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
                            key={renderedView}
                            transition={panelTransition}
                        >
                            {renderedView === 'main' ? (
                                <MainView
                                    command={command}
                                    configurationLabel={configurationLabel}
                                    currentRequest={currentRequest}
                                    isBootstrapping={isBootstrapping}
                                    isConfigured={isConfigured}
                                    isSubmitting={isSubmitting}
                                    modelLabel={activeModelLabel}
                                    onCommandChange={setCommand}
                                    onOpenSettings={() => void openSettings()}
                                    onSubmit={() => void handleSubmitCommand()}
                                    providerLabel={activeProviderLabel}
                                    statusEntry={activeStatus}
                                />
                            ) : (
                                <SettingsView
                                    backLabel={
                                        isSettingsWindow ? 'Fechar' : 'Voltar'
                                    }
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
