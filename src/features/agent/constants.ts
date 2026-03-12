import type { LLMProvider } from '@/features/agent/types'

export const AGENT_SETTINGS_STORE_PATH = 'agent-settings.json'
export const LLM_PROVIDER_STORAGE_KEY = 'llm_provider'
export const BROWSER_LLM_PROVIDER_STORAGE_KEY = 'speedai.llm_provider'
export const GEMINI_API_KEY_STORAGE_KEY = 'gemini_api_key'
export const BROWSER_API_KEY_STORAGE_KEY = 'speedai.gemini_api_key'
export const GEMINI_MODEL_STORAGE_KEY = 'gemini_model_id'
export const BROWSER_GEMINI_MODEL_STORAGE_KEY = 'speedai.gemini_model_id'
export const MODAL_API_KEY_STORAGE_KEY = 'modal_api_key'
export const BROWSER_MODAL_API_KEY_STORAGE_KEY = 'speedai.modal_api_key'
export const MODAL_MODEL_STORAGE_KEY = 'modal_model_id'
export const BROWSER_MODAL_MODEL_STORAGE_KEY = 'speedai.modal_model_id'
export const MODAL_THINKING_STORAGE_KEY = 'modal_thinking_enabled'
export const BROWSER_MODAL_THINKING_STORAGE_KEY =
    'speedai.modal_thinking_enabled'

export const DEFAULT_LLM_PROVIDER: LLMProvider = 'gemini'

export const DEFAULT_GEMINI_MODEL_ID = 'gemini-3-flash-preview'
export const DEFAULT_MODAL_MODEL_ID = 'zai-org/GLM-5-FP8'
export const DEFAULT_MODAL_THINKING_ENABLED = true
export const MODAL_BASE_URL = 'https://api.us-west-2.modal.direct/v1'
export const MODAL_CHAT_COMPLETIONS_PATH = '/chat/completions'
export const MODAL_MAX_OUTPUT_TOKENS = 768

export const LLM_PROVIDER_OPTIONS = [
    {
        id: 'gemini',
        label: 'Gemini'
    },
    {
        id: 'modal',
        label: 'Modal'
    }
] as const

export const GEMINI_MODEL_OPTIONS = [
    {
        id: DEFAULT_GEMINI_MODEL_ID,
        label: 'Gemini 3 Flash Preview'
    },
    {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash'
    }
] as const

export const MODAL_MODEL_OPTIONS = [
    {
        id: DEFAULT_MODAL_MODEL_ID,
        label: 'GLM-5 (Modal Free)'
    }
] as const

export function normalizeLLMProvider(
    provider: string | null | undefined
): LLMProvider {
    return LLM_PROVIDER_OPTIONS.some((option) => option.id === provider)
        ? (provider as LLMProvider)
        : DEFAULT_LLM_PROVIDER
}

export function getLLMProviderLabel(provider: string) {
    return (
        LLM_PROVIDER_OPTIONS.find((option) => option.id === provider)?.label ??
        LLM_PROVIDER_OPTIONS[0].label
    )
}

export function normalizeGeminiModelId(modelId: string | null | undefined) {
    if (typeof modelId !== 'string') {
        return DEFAULT_GEMINI_MODEL_ID
    }

    return GEMINI_MODEL_OPTIONS.some((option) => option.id === modelId)
        ? modelId
        : DEFAULT_GEMINI_MODEL_ID
}

export function getGeminiModelLabel(modelId: string) {
    return (
        GEMINI_MODEL_OPTIONS.find((option) => option.id === modelId)?.label ??
        GEMINI_MODEL_OPTIONS[0].label
    )
}

export function normalizeModalModelId(modelId: string | null | undefined) {
    if (typeof modelId !== 'string') {
        return DEFAULT_MODAL_MODEL_ID
    }

    return MODAL_MODEL_OPTIONS.some((option) => option.id === modelId)
        ? modelId
        : DEFAULT_MODAL_MODEL_ID
}

export function getModalModelLabel(modelId: string) {
    return (
        MODAL_MODEL_OPTIONS.find((option) => option.id === modelId)?.label ??
        MODAL_MODEL_OPTIONS[0].label
    )
}

export function normalizeModalThinkingEnabled(
    thinkingEnabled: boolean | string | null | undefined
) {
    if (typeof thinkingEnabled === 'boolean') {
        return thinkingEnabled
    }

    if (typeof thinkingEnabled === 'string') {
        if (thinkingEnabled === 'true') {
            return true
        }

        if (thinkingEnabled === 'false') {
            return false
        }
    }

    return DEFAULT_MODAL_THINKING_ENABLED
}

export const WEB_NAVIGATE_TOOL_NAME = 'web_navigate'
export const WEB_SNAPSHOT_TOOL_NAME = 'web_snapshot'
export const WEB_CLICK_TOOL_NAME = 'web_click'
export const WEB_TYPE_TOOL_NAME = 'web_type'
export const WEB_PRESS_TOOL_NAME = 'web_press'
export const WEB_WAIT_TOOL_NAME = 'web_wait'
export const WEB_SCROLL_TOOL_NAME = 'web_scroll'

export const MAX_STATUS_ENTRIES = 10
export const MAX_AGENT_TOOL_STEPS = 10
