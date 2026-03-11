import { invoke, isTauri } from '@tauri-apps/api/core'
import type {
    BrowserAgentAction,
    BrowserAgentActionResult
} from '@/features/agent/types'

function assertTauriRuntime() {
    if (!isTauri()) {
        throw new Error(
            'A automacao web so pode ser executada dentro do runtime do Tauri.'
        )
    }
}

export async function executeBrowserAgentAction(
    request: BrowserAgentAction
): Promise<BrowserAgentActionResult> {
    assertTauriRuntime()

    return invoke<BrowserAgentActionResult>('execute_browser_agent_action', {
        request
    })
}

export async function resetBrowserAgentSession() {
    if (!isTauri()) {
        return
    }

    await invoke('reset_browser_agent_session')
}
