import { emit } from '@tauri-apps/api/event'
import { isTauri } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type {
    AgentResultSummary,
    AgentStatusEntry
} from '@/features/agent/types'

export const RESULT_WINDOW_LABEL = 'result'
export const RESULT_UPDATED_EVENT = 'speedai://result-updated'
const BROWSER_RESULT_STORAGE_KEY = 'speedai.latest_result_summary'

function buildResultWindowUrl() {
    const resultUrl = new URL(window.location.href)
    resultUrl.pathname = '/'
    resultUrl.search = ''
    resultUrl.searchParams.set('view', 'result')
    resultUrl.hash = ''

    return resultUrl
}

function normalizeResultSummary(summary: unknown): AgentResultSummary | null {
    if (typeof summary !== 'object' || summary === null) {
        return null
    }

    const candidate = summary as Partial<AgentResultSummary>

    if (
        typeof candidate.id !== 'string' ||
        typeof candidate.timestamp !== 'string' ||
        (candidate.tone !== 'success' && candidate.tone !== 'error') ||
        typeof candidate.title !== 'string' ||
        typeof candidate.detail !== 'string' ||
        typeof candidate.request !== 'string' ||
        typeof candidate.providerLabel !== 'string' ||
        typeof candidate.modelLabel !== 'string' ||
        !Array.isArray(candidate.entries)
    ) {
        return null
    }

    const entries = candidate.entries
        .map(normalizeStatusEntry)
        .filter((entry) => entry !== null)

    if (entries.length === 0) {
        return null
    }

    return {
        id: candidate.id,
        timestamp: candidate.timestamp,
        tone: candidate.tone,
        title: candidate.title,
        detail: candidate.detail,
        request: candidate.request,
        providerLabel: candidate.providerLabel,
        modelLabel: candidate.modelLabel,
        entries
    }
}

function normalizeStatusEntry(entry: unknown): AgentStatusEntry | null {
    if (typeof entry !== 'object' || entry === null) {
        return null
    }

    const candidate = entry as Partial<AgentStatusEntry>

    if (
        typeof candidate.id !== 'string' ||
        typeof candidate.timestamp !== 'string' ||
        typeof candidate.tone !== 'string' ||
        typeof candidate.title !== 'string' ||
        typeof candidate.detail !== 'string'
    ) {
        return null
    }

    if (
        candidate.tone !== 'idle' &&
        candidate.tone !== 'thinking' &&
        candidate.tone !== 'executing' &&
        candidate.tone !== 'success' &&
        candidate.tone !== 'error' &&
        candidate.tone !== 'info'
    ) {
        return null
    }

    return {
        id: candidate.id,
        timestamp: candidate.timestamp,
        tone: candidate.tone,
        title: candidate.title,
        detail: candidate.detail,
        request:
            typeof candidate.request === 'string'
                ? candidate.request
                : undefined,
        toolName:
            typeof candidate.toolName === 'string'
                ? candidate.toolName
                : undefined
    }
}

async function focusResultWindow(windowHandle: WebviewWindow) {
    if (await windowHandle.isMinimized()) {
        await windowHandle.unminimize()
    }

    await windowHandle.show()
    await windowHandle.setFocus()
}

export function isResultWindowContext() {
    if (typeof window === 'undefined') {
        return false
    }

    return new URLSearchParams(window.location.search).get('view') === 'result'
}

export function loadLatestResultSummary(): AgentResultSummary | null {
    if (typeof window === 'undefined') {
        return null
    }

    const storedValue = window.localStorage.getItem(BROWSER_RESULT_STORAGE_KEY)

    if (storedValue === null) {
        return null
    }

    try {
        return normalizeResultSummary(JSON.parse(storedValue))
    } catch (error) {
        console.error('Failed to parse latest result summary', error)
        return null
    }
}

export function saveLatestResultSummary(summary: AgentResultSummary) {
    if (typeof window === 'undefined') {
        return
    }

    window.localStorage.setItem(
        BROWSER_RESULT_STORAGE_KEY,
        JSON.stringify(summary)
    )
}

export async function openResultWindow(): Promise<boolean> {
    if (typeof window === 'undefined') {
        return false
    }

    const resultUrl = buildResultWindowUrl()

    if (!isTauri()) {
        const popup = window.open(
            resultUrl.toString(),
            RESULT_WINDOW_LABEL,
            'popup=yes,width=760,height=680'
        )

        popup?.focus()

        return popup !== null
    }

    const existingWindow = await WebviewWindow.getByLabel(RESULT_WINDOW_LABEL)

    if (existingWindow !== null) {
        await focusResultWindow(existingWindow)
        return true
    }

    const resultWindow = new WebviewWindow(RESULT_WINDOW_LABEL, {
        url: resultUrl.toString(),
        title: 'Resumo da Tarefa',
        width: 820,
        height: 820,
        minWidth: 720,
        minHeight: 620,
        center: true,
        resizable: true,
        decorations: false,
        transparent: true,
        shadow: true,
        focus: true
    })

    return await new Promise<boolean>((resolve) => {
        void resultWindow.once('tauri://created', async () => {
            try {
                await focusResultWindow(resultWindow)
            } catch (error) {
                console.error('Failed to focus result window', error)
            }

            resolve(true)
        })

        void resultWindow.once('tauri://error', (event) => {
            console.error('Failed to create result window', event)
            resolve(false)
        })
    })
}

export async function notifyResultUpdated(
    summary: AgentResultSummary
): Promise<void> {
    if (!isTauri()) {
        return
    }

    await emit(RESULT_UPDATED_EVENT, summary)
}

export async function presentResultWindow(
    summary: AgentResultSummary
): Promise<boolean> {
    saveLatestResultSummary(summary)

    const openedWindow = await openResultWindow()

    if (openedWindow) {
        await notifyResultUpdated(summary)
    }

    return openedWindow
}
