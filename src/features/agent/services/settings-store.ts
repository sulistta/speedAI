import { isTauri } from '@tauri-apps/api/core'
import { LazyStore } from '@tauri-apps/plugin-store'
import {
    AGENT_SETTINGS_STORE_PATH,
    BROWSER_API_KEY_STORAGE_KEY,
    BROWSER_GEMINI_MODEL_STORAGE_KEY,
    BROWSER_LLM_PROVIDER_STORAGE_KEY,
    BROWSER_MAX_AGENT_TOOL_STEPS_STORAGE_KEY,
    BROWSER_VISUAL_OVERLAY_STORAGE_KEY,
    BROWSER_MODAL_API_KEY_STORAGE_KEY,
    BROWSER_MODAL_MODEL_STORAGE_KEY,
    BROWSER_MODAL_THINKING_STORAGE_KEY,
    DEFAULT_MAX_AGENT_TOOL_STEPS,
    DEFAULT_LLM_PROVIDER,
    GEMINI_API_KEY_STORAGE_KEY,
    GEMINI_MODEL_STORAGE_KEY,
    LLM_PROVIDER_STORAGE_KEY,
    MAX_AGENT_TOOL_STEPS_STORAGE_KEY,
    VISUAL_OVERLAY_STORAGE_KEY,
    MODAL_API_KEY_STORAGE_KEY,
    MODAL_MODEL_STORAGE_KEY,
    MODAL_THINKING_STORAGE_KEY,
    normalizeGeminiModelId,
    normalizeLLMProvider,
    normalizeMaxAgentToolSteps,
    normalizeModalThinkingEnabled,
    normalizeModalModelId,
    normalizeVisualOverlayEnabled
} from '@/features/agent/constants'
import type { AgentLLMSettings } from '@/features/agent/types'

let settingsStore: LazyStore | null = null

function getSettingsStore() {
    if (settingsStore === null) {
        settingsStore = new LazyStore(AGENT_SETTINGS_STORE_PATH)
    }

    return settingsStore
}

function normalizeSettings(
    settings:
        | (Partial<
              Omit<
                  AgentLLMSettings,
                  | 'provider'
                  | 'modalThinkingEnabled'
                  | 'maxAgentToolSteps'
                  | 'visualOverlayEnabled'
              >
          > & {
              provider?: string | null
              modalThinkingEnabled?: boolean | string | null
              maxAgentToolSteps?: number | string | null
              visualOverlayEnabled?: boolean | string | null
          })
        | null
        | undefined
): AgentLLMSettings {
    return {
        provider: normalizeLLMProvider(settings?.provider),
        geminiApiKey: settings?.geminiApiKey?.trim() ?? '',
        geminiModelId: normalizeGeminiModelId(settings?.geminiModelId),
        modalApiKey: settings?.modalApiKey?.trim() ?? '',
        modalModelId: normalizeModalModelId(settings?.modalModelId),
        modalThinkingEnabled: normalizeModalThinkingEnabled(
            settings?.modalThinkingEnabled
        ),
        maxAgentToolSteps: normalizeMaxAgentToolSteps(
            settings?.maxAgentToolSteps
        ),
        visualOverlayEnabled: normalizeVisualOverlayEnabled(
            settings?.visualOverlayEnabled
        )
    }
}

export async function loadLLMSettings(): Promise<AgentLLMSettings> {
    if (!isTauri()) {
        return normalizeSettings({
            provider:
                window.localStorage.getItem(BROWSER_LLM_PROVIDER_STORAGE_KEY) ??
                DEFAULT_LLM_PROVIDER,
            geminiApiKey:
                window.localStorage.getItem(BROWSER_API_KEY_STORAGE_KEY) ?? '',
            geminiModelId:
                window.localStorage.getItem(BROWSER_GEMINI_MODEL_STORAGE_KEY) ??
                undefined,
            modalApiKey:
                window.localStorage.getItem(
                    BROWSER_MODAL_API_KEY_STORAGE_KEY
                ) ?? '',
            modalModelId:
                window.localStorage.getItem(BROWSER_MODAL_MODEL_STORAGE_KEY) ??
                undefined,
            modalThinkingEnabled: window.localStorage.getItem(
                BROWSER_MODAL_THINKING_STORAGE_KEY
            ),
            maxAgentToolSteps:
                window.localStorage.getItem(
                    BROWSER_MAX_AGENT_TOOL_STEPS_STORAGE_KEY
                ) ?? DEFAULT_MAX_AGENT_TOOL_STEPS,
            visualOverlayEnabled: window.localStorage.getItem(
                BROWSER_VISUAL_OVERLAY_STORAGE_KEY
            )
        })
    }

    const store = getSettingsStore()

    return normalizeSettings({
        provider: await store.get<string>(LLM_PROVIDER_STORAGE_KEY),
        geminiApiKey: await store.get<string>(GEMINI_API_KEY_STORAGE_KEY),
        geminiModelId: await store.get<string>(GEMINI_MODEL_STORAGE_KEY),
        modalApiKey: await store.get<string>(MODAL_API_KEY_STORAGE_KEY),
        modalModelId: await store.get<string>(MODAL_MODEL_STORAGE_KEY),
        modalThinkingEnabled: await store.get<boolean | string>(
            MODAL_THINKING_STORAGE_KEY
        ),
        maxAgentToolSteps: await store.get<number | string>(
            MAX_AGENT_TOOL_STEPS_STORAGE_KEY
        ),
        visualOverlayEnabled: await store.get<boolean | string>(
            VISUAL_OVERLAY_STORAGE_KEY
        )
    })
}

export async function saveLLMSettings(
    settings: AgentLLMSettings
): Promise<AgentLLMSettings> {
    const nextSettings = normalizeSettings(settings)

    if (!isTauri()) {
        window.localStorage.setItem(
            BROWSER_LLM_PROVIDER_STORAGE_KEY,
            nextSettings.provider
        )

        if (nextSettings.geminiApiKey.length === 0) {
            window.localStorage.removeItem(BROWSER_API_KEY_STORAGE_KEY)
        } else {
            window.localStorage.setItem(
                BROWSER_API_KEY_STORAGE_KEY,
                nextSettings.geminiApiKey
            )
        }

        window.localStorage.setItem(
            BROWSER_GEMINI_MODEL_STORAGE_KEY,
            nextSettings.geminiModelId
        )

        if (nextSettings.modalApiKey.length === 0) {
            window.localStorage.removeItem(BROWSER_MODAL_API_KEY_STORAGE_KEY)
        } else {
            window.localStorage.setItem(
                BROWSER_MODAL_API_KEY_STORAGE_KEY,
                nextSettings.modalApiKey
            )
        }

        window.localStorage.setItem(
            BROWSER_MODAL_MODEL_STORAGE_KEY,
            nextSettings.modalModelId
        )
        window.localStorage.setItem(
            BROWSER_MODAL_THINKING_STORAGE_KEY,
            String(nextSettings.modalThinkingEnabled)
        )
        window.localStorage.setItem(
            BROWSER_MAX_AGENT_TOOL_STEPS_STORAGE_KEY,
            String(nextSettings.maxAgentToolSteps)
        )
        window.localStorage.setItem(
            BROWSER_VISUAL_OVERLAY_STORAGE_KEY,
            String(nextSettings.visualOverlayEnabled)
        )

        return nextSettings
    }

    const store = getSettingsStore()

    await store.set(LLM_PROVIDER_STORAGE_KEY, nextSettings.provider)

    if (nextSettings.geminiApiKey.length === 0) {
        await store.delete(GEMINI_API_KEY_STORAGE_KEY)
    } else {
        await store.set(GEMINI_API_KEY_STORAGE_KEY, nextSettings.geminiApiKey)
    }

    await store.set(GEMINI_MODEL_STORAGE_KEY, nextSettings.geminiModelId)

    if (nextSettings.modalApiKey.length === 0) {
        await store.delete(MODAL_API_KEY_STORAGE_KEY)
    } else {
        await store.set(MODAL_API_KEY_STORAGE_KEY, nextSettings.modalApiKey)
    }

    await store.set(MODAL_MODEL_STORAGE_KEY, nextSettings.modalModelId)
    await store.set(
        MODAL_THINKING_STORAGE_KEY,
        nextSettings.modalThinkingEnabled
    )
    await store.set(
        MAX_AGENT_TOOL_STEPS_STORAGE_KEY,
        nextSettings.maxAgentToolSteps
    )
    await store.set(
        VISUAL_OVERLAY_STORAGE_KEY,
        nextSettings.visualOverlayEnabled
    )

    await store.save()

    return nextSettings
}
