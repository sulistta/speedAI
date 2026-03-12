export type AgentView = 'main' | 'settings' | 'result'

export type AgentStatusTone =
    | 'idle'
    | 'thinking'
    | 'executing'
    | 'success'
    | 'error'
    | 'info'

export type AgentResultTone = Extract<AgentStatusTone, 'success' | 'error'>

export type LLMProvider = 'gemini' | 'modal'

export interface AgentLLMSettings {
    provider: LLMProvider
    geminiApiKey: string
    geminiModelId: string
    modalApiKey: string
    modalModelId: string
    modalThinkingEnabled: boolean
}

export interface ModalToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

export interface ModalChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content?: string | null
    tool_calls?: ModalToolCall[]
    tool_call_id?: string
}

export interface ModalToolDefinition {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: Record<string, unknown>
    }
}

export interface ModalChatCompletionRequest {
    apiKey: string
    model: string
    messages: ModalChatMessage[]
    tools: ModalToolDefinition[]
    toolChoice: 'auto'
    thinkingEnabled: boolean
    temperature: number
    maxTokens: number
}

export interface ModalChatCompletionResponse {
    choices?: Array<{
        finish_reason?: string | null
        message?: ModalChatMessage
    }>
    error?: {
        message?: string
    }
}

export type BrowserAgentActionName =
    | 'navigate'
    | 'snapshot'
    | 'click'
    | 'type'
    | 'press'
    | 'wait'
    | 'scroll'

export interface BrowserSnapshotHeading {
    tag: string
    text: string
}

export interface BrowserSnapshotRegion {
    tag: string
    label?: string
    text: string
}

export interface BrowserSnapshotElement {
    targetId: string
    tag: string
    role?: string
    type?: string
    text: string
    label?: string
    placeholder?: string
    href?: string
    disabled: boolean
}

export interface BrowserPageSnapshot {
    title: string
    url: string
    headings: BrowserSnapshotHeading[]
    regions: BrowserSnapshotRegion[]
    elements: BrowserSnapshotElement[]
    generatedAt: string
}

export type BrowserAgentAction =
    | {
          action: 'navigate'
          url: string
      }
    | {
          action: 'snapshot'
      }
    | {
          action: 'click'
          targetId: string
      }
    | {
          action: 'type'
          targetId: string
          text: string
          submit?: boolean
      }
    | {
          action: 'press'
          key: string
      }
    | {
          action: 'wait'
          timeoutMs?: number
      }
    | {
          action: 'scroll'
          direction: 'up' | 'down'
          amount?: number
      }

export interface BrowserAgentActionResult {
    action: BrowserAgentActionName
    status: string
    detail: string
    snapshot: BrowserPageSnapshot
}

export interface AgentRunResult {
    message: string
    stepCount: number
}

export interface AgentExecutionStatus {
    tone: AgentStatusTone
    title: string
    detail: string
    toolName?: string
}

export interface AgentStatusEntry {
    id: string
    timestamp: string
    tone: AgentStatusTone
    title: string
    detail: string
    request?: string
    toolName?: string
}

export interface AgentResultSummary {
    id: string
    timestamp: string
    tone: AgentResultTone
    title: string
    detail: string
    request: string
    providerLabel: string
    modelLabel: string
    entries: AgentStatusEntry[]
}

export interface SettingsFeedback {
    tone: 'idle' | 'success' | 'error'
    message: string
}
