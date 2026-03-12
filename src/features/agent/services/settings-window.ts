import { emit } from '@tauri-apps/api/event'
import { isTauri } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { AgentLLMSettings } from '@/features/agent/types'

export const SETTINGS_WINDOW_LABEL = 'settings'
export const SETTINGS_UPDATED_EVENT = 'speedai://settings-updated'

export function isSettingsWindowContext() {
    if (typeof window === 'undefined') {
        return false
    }

    return (
        new URLSearchParams(window.location.search).get('view') === 'settings'
    )
}

export async function openSettingsWindow(): Promise<boolean> {
    if (!isTauri()) {
        return false
    }

    const existingWindow = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL)

    if (existingWindow !== null) {
        if (await existingWindow.isMinimized()) {
            await existingWindow.unminimize()
        }

        await existingWindow.show()
        await existingWindow.setFocus()
        return true
    }

    const settingsUrl = new URL(window.location.href)
    settingsUrl.pathname = '/'
    settingsUrl.search = ''
    settingsUrl.searchParams.set('view', 'settings')
    settingsUrl.hash = ''

    const settingsWindow = new WebviewWindow(SETTINGS_WINDOW_LABEL, {
        url: settingsUrl.toString(),
        title: 'SpeedAI Settings',
        width: 760,
        height: 820,
        minWidth: 700,
        minHeight: 760,
        center: true,
        resizable: true,
        decorations: false,
        transparent: true,
        shadow: true,
        focus: true
    })

    return await new Promise<boolean>((resolve) => {
        void settingsWindow.once('tauri://created', async () => {
            try {
                await settingsWindow.setFocus()
            } catch (error) {
                console.error('Failed to focus settings window', error)
            }

            resolve(true)
        })

        void settingsWindow.once('tauri://error', (event) => {
            console.error('Failed to create settings window', event)
            resolve(false)
        })
    })
}

export async function notifySettingsUpdated(
    settings: AgentLLMSettings
): Promise<void> {
    if (!isTauri()) {
        return
    }

    await emit(SETTINGS_UPDATED_EVENT, settings)
}
