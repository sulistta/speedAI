import {
    getGeminiModelLabel,
    getLLMProviderLabel,
    getModalModelLabel
} from '@/features/agent/constants'
import { runGeminiAgentCommand } from '@/features/agent/services/gemini-service'
import { runModalAgentCommand } from '@/features/agent/services/modal-service'
import type {
    AgentExecutionStatus,
    AgentLLMSettings,
    AgentRunResult
} from '@/features/agent/types'

export function getActiveModelLabel(settings: AgentLLMSettings) {
    return settings.provider === 'modal'
        ? getModalModelLabel(settings.modalModelId)
        : getGeminiModelLabel(settings.geminiModelId)
}

export function getActiveProviderLabel(settings: AgentLLMSettings) {
    return getLLMProviderLabel(settings.provider)
}

export function isProviderConfigured(settings: AgentLLMSettings) {
    return settings.provider === 'modal'
        ? settings.modalApiKey.trim().length > 0
        : settings.geminiApiKey.trim().length > 0
}

export async function runAgentCommand(
    input: string,
    settings: AgentLLMSettings,
    onStatus?: (status: AgentExecutionStatus) => void
): Promise<AgentRunResult> {
    if (settings.provider === 'modal') {
        return runModalAgentCommand(
            input,
            settings.modalApiKey,
            settings.modalModelId,
            settings.modalThinkingEnabled,
            settings.maxAgentToolSteps,
            onStatus
        )
    }

    return runGeminiAgentCommand(
        input,
        settings.geminiApiKey,
        settings.geminiModelId,
        settings.maxAgentToolSteps,
        onStatus
    )
}
