import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

export const MAIN_WINDOW_LABEL = 'main'

function getWindowHandle() {
    return getCurrentWindow()
}

export async function minimizeCurrentWindow(): Promise<void> {
    if (!isTauri()) {
        return
    }

    await getWindowHandle().minimize()
}

export async function closeCurrentWindow(): Promise<void> {
    if (!isTauri()) {
        return
    }

    await getWindowHandle().close()
}

export async function startCurrentWindowDrag(): Promise<void> {
    if (!isTauri()) {
        return
    }

    await getWindowHandle().startDragging()
}

export async function focusWindowByLabel(label: string): Promise<boolean> {
    if (!isTauri()) {
        return false
    }

    const windowHandle = await WebviewWindow.getByLabel(label)

    if (windowHandle === null) {
        return false
    }

    if (await windowHandle.isMinimized()) {
        await windowHandle.unminimize()
    }

    await windowHandle.show()
    await windowHandle.setFocus()

    return true
}

export async function focusMainWindow(): Promise<void> {
    if (!isTauri()) {
        if (typeof window !== 'undefined') {
            window.opener?.focus()
        }

        return
    }

    await focusWindowByLabel(MAIN_WINDOW_LABEL)
}
