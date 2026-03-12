import { isTauri } from '@tauri-apps/api/core'
import { LazyStore } from '@tauri-apps/plugin-store'
import {
    AGENT_SETTINGS_STORE_PATH,
    BROWSER_API_KEY_STORAGE_KEY,
    BROWSER_GEMINI_MODEL_STORAGE_KEY,
    BROWSER_LLM_PROVIDER_STORAGE_KEY,
    BROWSER_MODAL_API_KEY_STORAGE_KEY,
    BROWSER_MODAL_MODEL_STORAGE_KEY,
    BROWSER_MODAL_THINKING_STORAGE_KEY,
    DEFAULT_LLM_PROVIDER,
    GEMINI_API_KEY_STORAGE_KEY,
    GEMINI_MODEL_STORAGE_KEY,
    LLM_PROVIDER_STORAGE_KEY,
    MODAL_API_KEY_STORAGE_KEY,
    MODAL_MODEL_STORAGE_KEY,
    MODAL_THINKING_STORAGE_KEY,
    normalizeGeminiModelId,
    normalizeLLMProvider,
    normalizeModalThinkingEnabled,
    normalizeModalModelId
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
              Omit<AgentLLMSettings, 'provider' | 'modalThinkingEnabled'>
          > & {
              provider?: string | null
              modalThinkingEnabled?: boolean | string | null
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

    await store.save()

    return nextSettings
}
