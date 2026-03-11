import { invoke, isTauri } from '@tauri-apps/api/core'
import type {
    WhatsappActionResult,
    WhatsappToolArguments
} from '@/features/agent/types'

export async function executeWhatsappAction(
    args: WhatsappToolArguments
): Promise<WhatsappActionResult> {
    if (!isTauri()) {
        throw new Error(
            'A acao de desktop so pode ser executada dentro do runtime do Tauri.'
        )
    }

    return invoke<WhatsappActionResult>('execute_whatsapp_action', {
        contact: args.contact,
        message: args.message
    })
}
