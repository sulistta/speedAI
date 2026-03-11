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
}

export interface WhatsappToolArguments {
    contact: string
    message: string
}

export interface AgentToolCall {
    name: 'open_whatsapp_and_send_message'
    args: WhatsappToolArguments
}

export type AgentRunResult =
    | {
          kind: 'tool-call'
          toolCall: AgentToolCall
          message?: string
      }
    | {
          kind: 'text'
          message: string
      }

export interface WhatsappActionResult {
    status: string
    detail: string
    openedUrl: string
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
