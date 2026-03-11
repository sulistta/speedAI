import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

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
