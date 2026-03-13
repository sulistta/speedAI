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
    maxAgentToolSteps: number
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

export type BrowserSnapshotMode = 'full' | 'interactive' | 'focused' | 'delta'

export type BrowserAgentActionName =
    | 'navigate'
    | 'snapshot'
    | 'click'
    | 'type'
    | 'press'
    | 'wait'
    | 'waitForNavigation'
    | 'waitForUrl'
    | 'waitForText'
    | 'waitForElement'
    | 'waitForResultsChange'
    | 'scroll'
    | 'clickAndWait'
    | 'typeAndSubmit'

export interface BrowserSnapshotOptions {
    snapshotMode?: BrowserSnapshotMode
    focusText?: string
}

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
    mode: BrowserSnapshotMode
    focusText?: string
    generatedAt: string
}

export type BrowserAgentAction =
    | ({
          action: 'navigate'
          url: string
      } & BrowserSnapshotOptions)
    | ({
          action: 'snapshot'
      } & BrowserSnapshotOptions)
    | ({
          action: 'click'
          targetId: string
      } & BrowserSnapshotOptions)
    | ({
          action: 'type'
          targetId: string
          text: string
          submit?: boolean
      } & BrowserSnapshotOptions)
    | ({
          action: 'press'
          key: string
      } & BrowserSnapshotOptions)
    | ({
          action: 'wait'
          timeoutMs?: number
      } & BrowserSnapshotOptions)
    | ({
          action: 'waitForNavigation'
          timeoutMs?: number
          urlIncludes?: string
      } & BrowserSnapshotOptions)
    | ({
          action: 'waitForUrl'
          url: string
          timeoutMs?: number
      } & BrowserSnapshotOptions)
    | ({
          action: 'waitForText'
          text: string
          timeoutMs?: number
      } & BrowserSnapshotOptions)
    | ({
          action: 'waitForElement'
          targetId?: string
          text?: string
          timeoutMs?: number
      } & BrowserSnapshotOptions)
    | ({
          action: 'waitForResultsChange'
          timeoutMs?: number
          minimumChange?: number
      } & BrowserSnapshotOptions)
    | ({
          action: 'scroll'
          direction: 'up' | 'down'
          amount?: number
      } & BrowserSnapshotOptions)
    | ({
          action: 'clickAndWait'
          targetId: string
          waitForText?: string
          waitForUrl?: string
          timeoutMs?: number
      } & BrowserSnapshotOptions)
    | ({
          action: 'typeAndSubmit'
          targetId: string
          text: string
          waitForText?: string
          waitForUrl?: string
          timeoutMs?: number
      } & BrowserSnapshotOptions)

export interface BrowserAgentReadiness {
    state: 'stable' | 'changed'
    detail: string
    urlChanged: boolean
    contentChanged: boolean
}

export interface BrowserAgentMetrics {
    actionDurationMs: number
    settleDurationMs: number
    snapshotDurationMs: number
    snapshotBytes: number
    snapshotMode: BrowserSnapshotMode
    snapshotElementCount: number
    snapshotHeadingCount: number
    snapshotRegionCount: number
}

export interface BrowserAgentActionResult {
    action: BrowserAgentActionName
    status: string
    detail: string
    snapshot: BrowserPageSnapshot
    readiness: BrowserAgentReadiness
    metrics: BrowserAgentMetrics
}

export interface AgentExecutionMetrics {
    totalDurationMs: number
    stepCount: number
    llmRoundTrips: number
    llmLatencyMs: number
    toolCalls: number
    toolLatencyMs: number
    settleLatencyMs: number
    snapshotLatencyMs: number
    snapshotBytes: number
}

export interface AgentRunResult {
    message: string
    stepCount: number
    metrics: AgentExecutionMetrics
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
    metrics?: AgentExecutionMetrics
}

export interface SettingsFeedback {
    tone: 'idle' | 'success' | 'error'
    message: string
}
