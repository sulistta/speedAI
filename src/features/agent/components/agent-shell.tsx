import { AnimatePresence, motion } from 'framer-motion'
import { startTransition, useEffect, useState } from 'react'
import { getGeminiModelLabel } from '@/features/agent/constants'
import MainView from '@/features/agent/components/main-view'
import SettingsView from '@/features/agent/components/settings-view'
import WindowChrome from '@/features/agent/components/window-chrome'
import { resetBrowserAgentSession } from '@/features/agent/services/desktop-actions'
import { runDesktopAgentCommand } from '@/features/agent/services/gemini-service'
import {
    loadGeminiSettings,
    saveGeminiSettings
} from '@/features/agent/services/settings-store'
import type {
    AgentExecutionStatus,
    AgentStatusEntry,
    AgentView,
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

function buildInitialStatus(
    hasApiKey: boolean,
    modelId: string
): AgentStatusEntry {
    const modelLabel = getGeminiModelLabel(modelId)

    if (hasApiKey) {
        return createStatusEntry({
            tone: 'success',
            title: 'Agente pronto',
            detail: `${modelLabel} carregado com uma chave salva no store.`
        })
    }

    return createStatusEntry({
        tone: 'info',
        title: 'Gemini ainda nao configurado',
        detail: `Abra Settings e salve sua API Key para habilitar a navegacao web assistida com ${modelLabel}.`
    })
}

export default function AgentShell() {
    const [activeView, setActiveView] = useState<AgentView>('main')
    const [command, setCommand] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [modelId, setModelId] = useState('')
    const [settingsApiKeyDraft, setSettingsApiKeyDraft] = useState('')
    const [settingsModelIdDraft, setSettingsModelIdDraft] = useState('')
    const [statusEntries, setStatusEntries] = useState<AgentStatusEntry[]>([])
    const [settingsFeedback, setSettingsFeedback] =
        useState<SettingsFeedback | null>(null)
    const [isBootstrapping, setIsBootstrapping] = useState(true)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        let isMounted = true

        async function bootstrap() {
            try {
                const settings = await loadGeminiSettings()

                if (!isMounted) {
                    return
                }

                setApiKey(settings.apiKey)
                setModelId(settings.modelId)
                setSettingsApiKeyDraft(settings.apiKey)
                setSettingsModelIdDraft(settings.modelId)
                setStatusEntries([
                    buildInitialStatus(
                        settings.apiKey.length > 0,
                        settings.modelId
                    )
                ])
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
        setSettingsApiKeyDraft(apiKey)
        setSettingsModelIdDraft(modelId)
        startTransition(() => setActiveView('settings'))
    }

    function closeSettings() {
        startTransition(() => setActiveView('main'))
    }

    async function handleSaveSettings() {
        if (isSavingSettings) {
            return
        }

        setIsSavingSettings(true)
        setSettingsFeedback(null)

        try {
            const savedSettings = await saveGeminiSettings({
                apiKey: settingsApiKeyDraft,
                modelId: settingsModelIdDraft
            })
            const hasApiKey = savedSettings.apiKey.length > 0
            const savedModelLabel = getGeminiModelLabel(savedSettings.modelId)

            setApiKey(savedSettings.apiKey)
            setModelId(savedSettings.modelId)
            setSettingsApiKeyDraft(savedSettings.apiKey)
            setSettingsModelIdDraft(savedSettings.modelId)
            setSettingsFeedback({
                tone: 'success',
                message: hasApiKey
                    ? `Configuracoes salvas com sucesso. Modelo: ${savedModelLabel}.`
                    : `Modelo ${savedModelLabel} salvo. API Key removida do plugin-store.`
            })

            pushStatus(
                createStatusEntry({
                    tone: hasApiKey ? 'success' : 'info',
                    title: hasApiKey
                        ? 'Credenciais atualizadas'
                        : 'Credenciais removidas',
                    detail: hasApiKey
                        ? `O agente ja pode executar navegacao web com ${savedModelLabel}.`
                        : 'O agente ficou sem API Key configurada.'
                })
            )
        } catch (error) {
            setSettingsFeedback({
                tone: 'error',
                message: getErrorMessage(error)
            })

            pushStatus(
                createStatusEntry({
                    tone: 'error',
                    title: 'Falha ao salvar a API Key',
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

        if (apiKey.trim().length === 0) {
            pushStatus(
                createStatusEntry({
                    tone: 'info',
                    title: 'Configuracao obrigatoria',
                    detail: 'Salve sua API Key do Gemini antes de executar comandos.',
                    request: trimmedCommand
                })
            )
            openSettings()
            return
        }

        setIsSubmitting(true)
        const currentModelLabel = getGeminiModelLabel(modelId)

        pushStatus(
            createStatusEntry({
                tone: 'thinking',
                title: 'Pensando...',
                detail: `Planejando a navegacao com ${currentModelLabel}.`,
                request: trimmedCommand
            })
        )

        try {
            const result = await runDesktopAgentCommand(
                trimmedCommand,
                apiKey,
                modelId,
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
                                    hasApiKey={apiKey.trim().length > 0}
                                    isBootstrapping={isBootstrapping}
                                    isSubmitting={isSubmitting}
                                    modelLabel={getGeminiModelLabel(modelId)}
                                    onCommandChange={setCommand}
                                    onOpenSettings={openSettings}
                                    onSubmit={() => void handleSubmitCommand()}
                                    statusEntries={statusEntries}
                                />
                            ) : (
                                <SettingsView
                                    apiKey={settingsApiKeyDraft}
                                    feedback={settingsFeedback}
                                    isSaving={isSavingSettings}
                                    modelId={settingsModelIdDraft}
                                    onApiKeyChange={setSettingsApiKeyDraft}
                                    onModelIdChange={setSettingsModelIdDraft}
                                    onBack={closeSettings}
                                    onSave={() => void handleSaveSettings()}
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </section>
        </main>
    )
}
