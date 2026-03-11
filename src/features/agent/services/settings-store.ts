import { isTauri } from '@tauri-apps/api/core'
import { LazyStore } from '@tauri-apps/plugin-store'
import {
    AGENT_SETTINGS_STORE_PATH,
    BROWSER_API_KEY_STORAGE_KEY,
    GEMINI_API_KEY_STORAGE_KEY
} from '@/features/agent/constants'
import type { GeminiSettings } from '@/features/agent/types'

let settingsStore: LazyStore | null = null

function getSettingsStore() {
    if (settingsStore === null) {
        settingsStore = new LazyStore(AGENT_SETTINGS_STORE_PATH)
    }

    return settingsStore
}

export async function loadGeminiSettings(): Promise<GeminiSettings> {
    if (!isTauri()) {
        return {
            apiKey:
                window.localStorage.getItem(BROWSER_API_KEY_STORAGE_KEY) ?? ''
        }
    }

    const apiKey =
        (await getSettingsStore().get<string>(GEMINI_API_KEY_STORAGE_KEY)) ?? ''

    return { apiKey }
}

export async function saveGeminiSettings(
    settings: GeminiSettings
): Promise<GeminiSettings> {
    const nextSettings = {
        apiKey: settings.apiKey.trim()
    }

    if (!isTauri()) {
        if (nextSettings.apiKey.length === 0) {
            window.localStorage.removeItem(BROWSER_API_KEY_STORAGE_KEY)
        } else {
            window.localStorage.setItem(
                BROWSER_API_KEY_STORAGE_KEY,
                nextSettings.apiKey
            )
        }

        return nextSettings
    }

    const store = getSettingsStore()

    if (nextSettings.apiKey.length === 0) {
        await store.delete(GEMINI_API_KEY_STORAGE_KEY)
    } else {
        await store.set(GEMINI_API_KEY_STORAGE_KEY, nextSettings.apiKey)
    }

    await store.save()

    return nextSettings
}
