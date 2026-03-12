import { MAX_STATUS_ENTRIES } from '@/features/agent/constants'
import type {
    AgentResultSummary,
    AgentResultTone,
    AgentStatusEntry,
    AgentStatusTone
} from '@/features/agent/types'

function generateEntryId() {
    return typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createStatusEntry({
    detail,
    request,
    title,
    tone,
    toolName
}: {
    detail: string
    request?: string
    title: string
    tone: AgentStatusTone
    toolName?: string
}): AgentStatusEntry {
    const statusId = generateEntryId()

    return {
        id: statusId,
        timestamp: new Date().toISOString(),
        tone,
        title,
        detail,
        request,
        toolName
    }
}

export function createResultSummary({
    detail,
    entries,
    modelLabel,
    providerLabel,
    request,
    title,
    tone
}: {
    detail: string
    entries: AgentStatusEntry[]
    modelLabel: string
    providerLabel: string
    request: string
    title: string
    tone: AgentResultTone
}): AgentResultSummary {
    return {
        id: generateEntryId(),
        timestamp: new Date().toISOString(),
        tone,
        title,
        detail,
        request,
        providerLabel,
        modelLabel,
        entries: [...entries]
    }
}

export function prependStatusEntry(
    currentEntries: AgentStatusEntry[],
    nextEntry: AgentStatusEntry
) {
    return [nextEntry, ...currentEntries].slice(0, MAX_STATUS_ENTRIES)
}

export function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message
    }

    return 'Nao foi possivel concluir esta etapa.'
}

export function formatStatusTime(timestamp: string) {
    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(timestamp))
}

export function maskApiKey(apiKey: string) {
    if (apiKey.length <= 10) {
        return apiKey
    }

    return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
}
