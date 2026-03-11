export const AGENT_SETTINGS_STORE_PATH = 'agent-settings.json'
export const GEMINI_API_KEY_STORAGE_KEY = 'gemini_api_key'
export const BROWSER_API_KEY_STORAGE_KEY = 'speedai.gemini_api_key'
export const GEMINI_MODEL_STORAGE_KEY = 'gemini_model_id'
export const BROWSER_GEMINI_MODEL_STORAGE_KEY = 'speedai.gemini_model_id'

export const DEFAULT_GEMINI_MODEL_ID = 'gemini-3-flash-preview'

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

export const WEB_NAVIGATE_TOOL_NAME = 'web_navigate'
export const WEB_SNAPSHOT_TOOL_NAME = 'web_snapshot'
export const WEB_CLICK_TOOL_NAME = 'web_click'
export const WEB_TYPE_TOOL_NAME = 'web_type'
export const WEB_PRESS_TOOL_NAME = 'web_press'
export const WEB_WAIT_TOOL_NAME = 'web_wait'
export const WEB_SCROLL_TOOL_NAME = 'web_scroll'

export const MAX_STATUS_ENTRIES = 10
export const MAX_AGENT_TOOL_STEPS = 10
