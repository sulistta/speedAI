import {
    WEB_CLICK_TOOL_NAME,
    WEB_NAVIGATE_TOOL_NAME,
    WEB_PRESS_TOOL_NAME,
    WEB_SCROLL_TOOL_NAME,
    WEB_SNAPSHOT_TOOL_NAME,
    WEB_TYPE_TOOL_NAME,
    WEB_WAIT_TOOL_NAME
} from '@/features/agent/constants'
import type {
    AgentExecutionStatus,
    BrowserAgentAction,
    BrowserAgentActionResult,
    BrowserPageSnapshot
} from '@/features/agent/types'
import { getErrorMessage } from '@/features/agent/utils'

export type BrowserToolName =
    | typeof WEB_NAVIGATE_TOOL_NAME
    | typeof WEB_SNAPSHOT_TOOL_NAME
    | typeof WEB_CLICK_TOOL_NAME
    | typeof WEB_TYPE_TOOL_NAME
    | typeof WEB_PRESS_TOOL_NAME
    | typeof WEB_WAIT_TOOL_NAME
    | typeof WEB_SCROLL_TOOL_NAME

export interface BrowserToolDefinition {
    name: BrowserToolName
    description: string
    parametersSchema: Record<string, unknown>
}

export const browserSystemInstruction = `You are a desktop web navigation agent running inside a Tauri assistant.
Your job is to finish the user's task by navigating websites step by step.

Rules:
- Call at most one tool per turn.
- Use only target IDs from the latest page snapshot.
- Never invent target IDs, URLs, or page state.
- If no relevant page is open yet, navigate first.
- Prefer the smallest action that moves the task forward.
- After each tool result, re-evaluate the latest snapshot before deciding again.
- If the task is complete, answer in plain text with a concise result.
- If a site blocks progress with login, captcha, 2FA, or missing permissions, explain clearly what the user must do next.
- Do not ask for the full HTML. The tool responses already contain the filtered page context you need.`

export const browserToolDefinitions: BrowserToolDefinition[] = [
    {
        name: WEB_NAVIGATE_TOOL_NAME,
        description:
            'Open a URL or navigate the active browser tab to another page.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                url: {
                    type: 'string',
                    description:
                        'The absolute URL to open. Add https:// when needed.'
                }
            },
            required: ['url']
        }
    },
    {
        name: WEB_SNAPSHOT_TOOL_NAME,
        description:
            'Read the current page and return a filtered semantic snapshot with target IDs.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {}
        }
    },
    {
        name: WEB_CLICK_TOOL_NAME,
        description:
            'Click a visible interactive element from the latest snapshot.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                targetId: {
                    type: 'string',
                    description:
                        'The target ID from the latest snapshot, for example t3.'
                }
            },
            required: ['targetId']
        }
    },
    {
        name: WEB_TYPE_TOOL_NAME,
        description:
            'Fill or type into a visible input-like element from the latest snapshot.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                targetId: {
                    type: 'string',
                    description:
                        'The target ID from the latest snapshot, for example t5.'
                },
                text: {
                    type: 'string',
                    description: 'The exact text that should be entered.'
                },
                submit: {
                    type: 'boolean',
                    description:
                        'Set true only when pressing Enter right after typing is the intended action.'
                }
            },
            required: ['targetId', 'text']
        }
    },
    {
        name: WEB_PRESS_TOOL_NAME,
        description:
            'Press a keyboard key in the active browser page, for example Enter, Tab, Escape, ArrowDown.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                key: {
                    type: 'string',
                    description: 'The keyboard key to press.'
                }
            },
            required: ['key']
        }
    },
    {
        name: WEB_WAIT_TOOL_NAME,
        description:
            'Wait briefly for UI updates, async loading, or navigation to settle.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                timeoutMs: {
                    type: 'number',
                    description:
                        'Optional wait time in milliseconds. Use small values unless a longer wait is necessary.'
                }
            }
        }
    },
    {
        name: WEB_SCROLL_TOOL_NAME,
        description:
            'Scroll the current page when relevant elements are not yet visible.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                direction: {
                    type: 'string',
                    enum: ['up', 'down'],
                    description: 'The scroll direction.'
                },
                amount: {
                    type: 'number',
                    description:
                        'Optional scroll distance in pixels. Use moderate values.'
                }
            },
            required: ['direction']
        }
    }
]

export function buildOpenAICompatibleTools() {
    return browserToolDefinitions.map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parametersSchema
        }
    }))
}

function readRequiredStringArg(
    args: Record<string, unknown> | undefined,
    key: string
) {
    const value = args?.[key]

    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(
            `O modelo retornou uma chamada de ferramenta sem o campo obrigatorio "${key}".`
        )
    }

    return value.trim()
}

function readOptionalBooleanArg(
    args: Record<string, unknown> | undefined,
    key: string
) {
    const value = args?.[key]

    if (value === undefined) {
        return undefined
    }

    if (typeof value !== 'boolean') {
        throw new Error(
            `O modelo retornou um valor invalido para o campo booleano "${key}".`
        )
    }

    return value
}

function readOptionalNumberArg(
    args: Record<string, unknown> | undefined,
    key: string
) {
    const value = args?.[key]

    if (value === undefined) {
        return undefined
    }

    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(
            `O modelo retornou um valor invalido para o campo numerico "${key}".`
        )
    }

    return value
}

export function parseBrowserToolArguments(
    toolName: string,
    args: Record<string, unknown> | undefined
): BrowserAgentAction {
    switch (toolName) {
        case WEB_NAVIGATE_TOOL_NAME:
            return {
                action: 'navigate',
                url: readRequiredStringArg(args, 'url')
            }
        case WEB_SNAPSHOT_TOOL_NAME:
            return {
                action: 'snapshot'
            }
        case WEB_CLICK_TOOL_NAME:
            return {
                action: 'click',
                targetId: readRequiredStringArg(args, 'targetId')
            }
        case WEB_TYPE_TOOL_NAME:
            return {
                action: 'type',
                targetId: readRequiredStringArg(args, 'targetId'),
                text: readRequiredStringArg(args, 'text'),
                submit: readOptionalBooleanArg(args, 'submit')
            }
        case WEB_PRESS_TOOL_NAME:
            return {
                action: 'press',
                key: readRequiredStringArg(args, 'key')
            }
        case WEB_WAIT_TOOL_NAME:
            return {
                action: 'wait',
                timeoutMs: readOptionalNumberArg(args, 'timeoutMs')
            }
        case WEB_SCROLL_TOOL_NAME: {
            const direction = readRequiredStringArg(args, 'direction')

            if (direction !== 'up' && direction !== 'down') {
                throw new Error(
                    'O modelo tentou rolar a pagina com uma direcao nao suportada.'
                )
            }

            return {
                action: 'scroll',
                direction,
                amount: readOptionalNumberArg(args, 'amount')
            }
        }
        default:
            throw new Error(
                'O modelo tentou chamar uma ferramenta nao suportada.'
            )
    }
}

export function getToolName(action: BrowserAgentAction): BrowserToolName {
    switch (action.action) {
        case 'navigate':
            return WEB_NAVIGATE_TOOL_NAME
        case 'snapshot':
            return WEB_SNAPSHOT_TOOL_NAME
        case 'click':
            return WEB_CLICK_TOOL_NAME
        case 'type':
            return WEB_TYPE_TOOL_NAME
        case 'press':
            return WEB_PRESS_TOOL_NAME
        case 'wait':
            return WEB_WAIT_TOOL_NAME
        case 'scroll':
            return WEB_SCROLL_TOOL_NAME
    }
}

export function describeAction(
    action: BrowserAgentAction
): AgentExecutionStatus {
    switch (action.action) {
        case 'navigate':
            return {
                tone: 'executing',
                title: 'Abrindo pagina',
                detail: action.url,
                toolName: WEB_NAVIGATE_TOOL_NAME
            }
        case 'snapshot':
            return {
                tone: 'executing',
                title: 'Lendo pagina atual',
                detail: 'Coletando o snapshot semantico da aba ativa.',
                toolName: WEB_SNAPSHOT_TOOL_NAME
            }
        case 'click':
            return {
                tone: 'executing',
                title: 'Interagindo com a pagina',
                detail: `Clicando no elemento ${action.targetId}.`,
                toolName: WEB_CLICK_TOOL_NAME
            }
        case 'type':
            return {
                tone: 'executing',
                title: 'Preenchendo campo',
                detail: `Digitando no elemento ${action.targetId}.`,
                toolName: WEB_TYPE_TOOL_NAME
            }
        case 'press':
            return {
                tone: 'executing',
                title: 'Enviando atalho',
                detail: `Pressionando a tecla ${action.key}.`,
                toolName: WEB_PRESS_TOOL_NAME
            }
        case 'wait':
            return {
                tone: 'executing',
                title: 'Aguardando pagina',
                detail: `Esperando ${action.timeoutMs ?? 1200} ms por atualizacoes.`,
                toolName: WEB_WAIT_TOOL_NAME
            }
        case 'scroll':
            return {
                tone: 'executing',
                title: 'Rolando pagina',
                detail: `Rolando para ${action.direction}.`,
                toolName: WEB_SCROLL_TOOL_NAME
            }
    }
}

function buildElementLine(
    element: BrowserPageSnapshot['elements'][number]
): string {
    const attributes: string[] = [`${element.targetId}: <${element.tag}>`]

    if (element.role) {
        attributes.push(`role=${element.role}`)
    }

    if (element.type) {
        attributes.push(`type=${element.type}`)
    }

    if (element.label) {
        attributes.push(`label="${element.label}"`)
    }

    if (element.text) {
        attributes.push(`text="${element.text}"`)
    }

    if (element.placeholder) {
        attributes.push(`placeholder="${element.placeholder}"`)
    }

    if (element.href) {
        attributes.push(`href=${element.href}`)
    }

    if (element.disabled) {
        attributes.push('disabled=true')
    }

    return attributes.join(' | ')
}

export function formatSnapshotForModel(snapshot: BrowserPageSnapshot) {
    const lines = [
        `Page title: ${snapshot.title || 'Untitled page'}`,
        `Page URL: ${snapshot.url}`
    ]

    if (snapshot.headings.length > 0) {
        lines.push('Visible headings:')

        for (const heading of snapshot.headings) {
            lines.push(`- ${heading.tag}: ${heading.text}`)
        }
    }

    if (snapshot.regions.length > 0) {
        lines.push('Visible regions:')

        for (const region of snapshot.regions) {
            const prefix = region.label
                ? `${region.tag} (${region.label})`
                : region.tag

            lines.push(`- ${prefix}: ${region.text}`)
        }
    }

    lines.push('Interactive elements:')

    if (snapshot.elements.length === 0) {
        lines.push('- none visible in the current viewport')
    } else {
        for (const element of snapshot.elements) {
            lines.push(`- ${buildElementLine(element)}`)
        }
    }

    lines.push(
        'Target IDs are valid only for this latest snapshot. Ask for another snapshot after the page changes.'
    )

    return lines.join('\n')
}

export function buildToolResponsePayload(
    result: BrowserAgentActionResult,
    step: number
) {
    return {
        output: {
            ok: true,
            step,
            action: result.action,
            status: result.status,
            detail: result.detail,
            page: {
                title: result.snapshot.title,
                url: result.snapshot.url,
                generatedAt: result.snapshot.generatedAt
            },
            snapshot: formatSnapshotForModel(result.snapshot)
        }
    }
}

export function buildToolErrorPayload(error: unknown, step: number) {
    return {
        error: {
            ok: false,
            step,
            message: getErrorMessage(error)
        }
    }
}
