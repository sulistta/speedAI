export type AgentView = 'main' | 'settings'

export type AgentStatusTone =
    | 'idle'
    | 'thinking'
    | 'executing'
    | 'success'
    | 'error'
    | 'info'

export interface GeminiSettings {
    apiKey: string
    modelId: string
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

export interface SettingsFeedback {
    tone: 'idle' | 'success' | 'error'
    message: string
}
