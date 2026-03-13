import {
    WEB_CLICK_AND_WAIT_TOOL_NAME,
    WEB_CLICK_TOOL_NAME,
    WEB_NAVIGATE_TOOL_NAME,
    WEB_PRESS_TOOL_NAME,
    WEB_SCROLL_TOOL_NAME,
    WEB_SNAPSHOT_TOOL_NAME,
    WEB_TYPE_AND_SUBMIT_TOOL_NAME,
    WEB_TYPE_TOOL_NAME,
    WEB_WAIT_FOR_ELEMENT_TOOL_NAME,
    WEB_WAIT_FOR_NAVIGATION_TOOL_NAME,
    WEB_WAIT_FOR_RESULTS_CHANGE_TOOL_NAME,
    WEB_WAIT_FOR_TEXT_TOOL_NAME,
    WEB_WAIT_FOR_URL_TOOL_NAME,
    WEB_WAIT_TOOL_NAME
} from '@/features/agent/constants'
import type {
    AgentExecutionStatus,
    BrowserAgentAction,
    BrowserAgentActionResult,
    BrowserPageSnapshot,
    BrowserSnapshotMode
} from '@/features/agent/types'
import { getErrorMessage } from '@/features/agent/utils'

export type BrowserToolName =
    | typeof WEB_NAVIGATE_TOOL_NAME
    | typeof WEB_SNAPSHOT_TOOL_NAME
    | typeof WEB_CLICK_TOOL_NAME
    | typeof WEB_TYPE_TOOL_NAME
    | typeof WEB_PRESS_TOOL_NAME
    | typeof WEB_WAIT_TOOL_NAME
    | typeof WEB_WAIT_FOR_NAVIGATION_TOOL_NAME
    | typeof WEB_WAIT_FOR_URL_TOOL_NAME
    | typeof WEB_WAIT_FOR_TEXT_TOOL_NAME
    | typeof WEB_WAIT_FOR_ELEMENT_TOOL_NAME
    | typeof WEB_WAIT_FOR_RESULTS_CHANGE_TOOL_NAME
    | typeof WEB_SCROLL_TOOL_NAME
    | typeof WEB_CLICK_AND_WAIT_TOOL_NAME
    | typeof WEB_TYPE_AND_SUBMIT_TOOL_NAME

export interface BrowserToolDefinition {
    name: BrowserToolName
    description: string
    parametersSchema: Record<string, unknown>
}

const snapshotModeSchema = {
    type: 'string',
    enum: ['full', 'interactive', 'focused', 'delta'],
    description:
        'Optional snapshot mode. Use "focused" for narrow reads and "delta" after page changes.'
} as const

const focusTextSchema = {
    type: 'string',
    description:
        'Optional text hint used to prioritize relevant headings, regions, and interactive elements.'
} as const

const snapshotOptionProperties = {
    mode: snapshotModeSchema,
    focusText: focusTextSchema
}

export const browserSystemInstruction = `You are a desktop web navigation agent running inside a Tauri assistant.
Your job is to finish the user's task by navigating websites step by step.

Rules:
- Call at most one tool per turn.
- Use only target IDs from the latest page snapshot.
- Never invent target IDs, URLs, or page state.
- If no relevant page is open yet, navigate first.
- Prefer the smallest action that moves the task forward.
- Prefer semantic waits such as wait_for_url, wait_for_text, wait_for_element, or wait_for_results_change before using the generic wait tool.
- Prefer composed tools such as click_and_wait or type_and_submit when the next browser step is obvious and deterministic.
- Use web_snapshot with mode="focused" and focusText when you only need a narrow read.
- If a relevant visible result, card, title, or media item already appears in the latest snapshot, click it instead of scrolling again.
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
                },
                ...snapshotOptionProperties
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
            properties: {
                ...snapshotOptionProperties
            }
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
                },
                ...snapshotOptionProperties
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
                },
                ...snapshotOptionProperties
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
                },
                ...snapshotOptionProperties
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
                },
                ...snapshotOptionProperties
            }
        }
    },
    {
        name: WEB_WAIT_FOR_NAVIGATION_TOOL_NAME,
        description:
            'Wait until navigation completes or the URL changes. Prefer this over generic wait when a page transition is expected.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                urlIncludes: {
                    type: 'string',
                    description:
                        'Optional substring that must appear in the final URL.'
                },
                timeoutMs: {
                    type: 'number',
                    description: 'Optional timeout in milliseconds.'
                },
                ...snapshotOptionProperties
            }
        }
    },
    {
        name: WEB_WAIT_FOR_URL_TOOL_NAME,
        description:
            'Wait until the active page URL matches or contains the expected URL.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                url: {
                    type: 'string',
                    description:
                        'The expected absolute URL or meaningful substring.'
                },
                timeoutMs: {
                    type: 'number',
                    description: 'Optional timeout in milliseconds.'
                },
                ...snapshotOptionProperties
            },
            required: ['url']
        }
    },
    {
        name: WEB_WAIT_FOR_TEXT_TOOL_NAME,
        description:
            'Wait until visible page text contains the requested phrase.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                text: {
                    type: 'string',
                    description: 'Visible text that should appear on the page.'
                },
                timeoutMs: {
                    type: 'number',
                    description: 'Optional timeout in milliseconds.'
                },
                ...snapshotOptionProperties
            },
            required: ['text']
        }
    },
    {
        name: WEB_WAIT_FOR_ELEMENT_TOOL_NAME,
        description:
            'Wait until an interactive element is visible by target ID from the latest snapshot or by matching visible text.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                targetId: {
                    type: 'string',
                    description:
                        'Optional target ID from the latest snapshot when the same element should become visible or enabled.'
                },
                text: {
                    type: 'string',
                    description:
                        'Optional visible text, label, or placeholder to match.'
                },
                timeoutMs: {
                    type: 'number',
                    description: 'Optional timeout in milliseconds.'
                },
                ...snapshotOptionProperties
            }
        }
    },
    {
        name: WEB_WAIT_FOR_RESULTS_CHANGE_TOOL_NAME,
        description:
            'Wait until the visible result set changes after a search, filter, or pagination action.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                minimumChange: {
                    type: 'number',
                    description:
                        'Optional minimum change in visible interactive item count.'
                },
                timeoutMs: {
                    type: 'number',
                    description: 'Optional timeout in milliseconds.'
                },
                ...snapshotOptionProperties
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
                },
                ...snapshotOptionProperties
            },
            required: ['direction']
        }
    },
    {
        name: WEB_CLICK_AND_WAIT_TOOL_NAME,
        description:
            'Click an element and wait for a deterministic post-click condition in one tool call.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                targetId: {
                    type: 'string',
                    description:
                        'The target ID from the latest snapshot, for example t7.'
                },
                waitForText: {
                    type: 'string',
                    description:
                        'Optional visible text that should appear after the click.'
                },
                waitForUrl: {
                    type: 'string',
                    description:
                        'Optional absolute URL or substring expected after the click.'
                },
                timeoutMs: {
                    type: 'number',
                    description: 'Optional timeout in milliseconds.'
                },
                ...snapshotOptionProperties
            },
            required: ['targetId']
        }
    },
    {
        name: WEB_TYPE_AND_SUBMIT_TOOL_NAME,
        description:
            'Type into an input-like element, submit with Enter, and wait for a deterministic result.',
        parametersSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                targetId: {
                    type: 'string',
                    description:
                        'The target ID from the latest snapshot, for example t2.'
                },
                text: {
                    type: 'string',
                    description: 'The exact text to enter before submitting.'
                },
                waitForText: {
                    type: 'string',
                    description:
                        'Optional visible text that should appear after submission.'
                },
                waitForUrl: {
                    type: 'string',
                    description:
                        'Optional absolute URL or substring expected after submission.'
                },
                timeoutMs: {
                    type: 'number',
                    description: 'Optional timeout in milliseconds.'
                },
                ...snapshotOptionProperties
            },
            required: ['targetId', 'text']
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

function readOptionalStringArg(
    args: Record<string, unknown> | undefined,
    key: string
) {
    const value = args?.[key]

    if (value === undefined) {
        return undefined
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(
            `O modelo retornou um valor invalido para o campo string "${key}".`
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

function readOptionalSnapshotModeArg(
    args: Record<string, unknown> | undefined
): BrowserSnapshotMode | undefined {
    const mode = readOptionalStringArg(args, 'mode')

    if (mode === undefined) {
        return undefined
    }

    if (
        mode !== 'full' &&
        mode !== 'interactive' &&
        mode !== 'focused' &&
        mode !== 'delta'
    ) {
        throw new Error(
            'O modelo tentou usar um modo de snapshot nao suportado.'
        )
    }

    return mode
}

function readSnapshotOptions(args: Record<string, unknown> | undefined) {
    return {
        snapshotMode: readOptionalSnapshotModeArg(args),
        focusText: readOptionalStringArg(args, 'focusText')
    }
}

export function parseBrowserToolArguments(
    toolName: string,
    args: Record<string, unknown> | undefined
): BrowserAgentAction {
    const snapshotOptions = readSnapshotOptions(args)

    switch (toolName) {
        case WEB_NAVIGATE_TOOL_NAME:
            return {
                action: 'navigate',
                url: readRequiredStringArg(args, 'url'),
                ...snapshotOptions
            }
        case WEB_SNAPSHOT_TOOL_NAME:
            return {
                action: 'snapshot',
                ...snapshotOptions
            }
        case WEB_CLICK_TOOL_NAME:
            return {
                action: 'click',
                targetId: readRequiredStringArg(args, 'targetId'),
                ...snapshotOptions
            }
        case WEB_TYPE_TOOL_NAME:
            return {
                action: 'type',
                targetId: readRequiredStringArg(args, 'targetId'),
                text: readRequiredStringArg(args, 'text'),
                submit: readOptionalBooleanArg(args, 'submit'),
                ...snapshotOptions
            }
        case WEB_PRESS_TOOL_NAME:
            return {
                action: 'press',
                key: readRequiredStringArg(args, 'key'),
                ...snapshotOptions
            }
        case WEB_WAIT_TOOL_NAME:
            return {
                action: 'wait',
                timeoutMs: readOptionalNumberArg(args, 'timeoutMs'),
                ...snapshotOptions
            }
        case WEB_WAIT_FOR_NAVIGATION_TOOL_NAME:
            return {
                action: 'waitForNavigation',
                urlIncludes: readOptionalStringArg(args, 'urlIncludes'),
                timeoutMs: readOptionalNumberArg(args, 'timeoutMs'),
                ...snapshotOptions
            }
        case WEB_WAIT_FOR_URL_TOOL_NAME:
            return {
                action: 'waitForUrl',
                url: readRequiredStringArg(args, 'url'),
                timeoutMs: readOptionalNumberArg(args, 'timeoutMs'),
                ...snapshotOptions
            }
        case WEB_WAIT_FOR_TEXT_TOOL_NAME:
            return {
                action: 'waitForText',
                text: readRequiredStringArg(args, 'text'),
                timeoutMs: readOptionalNumberArg(args, 'timeoutMs'),
                ...snapshotOptions
            }
        case WEB_WAIT_FOR_ELEMENT_TOOL_NAME: {
            const targetId = readOptionalStringArg(args, 'targetId')
            const text = readOptionalStringArg(args, 'text')

            if (!targetId && !text) {
                throw new Error('wait_for_element exige targetId ou text.')
            }

            return {
                action: 'waitForElement',
                targetId,
                text,
                timeoutMs: readOptionalNumberArg(args, 'timeoutMs'),
                ...snapshotOptions
            }
        }
        case WEB_WAIT_FOR_RESULTS_CHANGE_TOOL_NAME:
            return {
                action: 'waitForResultsChange',
                minimumChange: readOptionalNumberArg(args, 'minimumChange'),
                timeoutMs: readOptionalNumberArg(args, 'timeoutMs'),
                ...snapshotOptions
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
                amount: readOptionalNumberArg(args, 'amount'),
                ...snapshotOptions
            }
        }
        case WEB_CLICK_AND_WAIT_TOOL_NAME:
            return {
                action: 'clickAndWait',
                targetId: readRequiredStringArg(args, 'targetId'),
                waitForText: readOptionalStringArg(args, 'waitForText'),
                waitForUrl: readOptionalStringArg(args, 'waitForUrl'),
                timeoutMs: readOptionalNumberArg(args, 'timeoutMs'),
                ...snapshotOptions
            }
        case WEB_TYPE_AND_SUBMIT_TOOL_NAME:
            return {
                action: 'typeAndSubmit',
                targetId: readRequiredStringArg(args, 'targetId'),
                text: readRequiredStringArg(args, 'text'),
                waitForText: readOptionalStringArg(args, 'waitForText'),
                waitForUrl: readOptionalStringArg(args, 'waitForUrl'),
                timeoutMs: readOptionalNumberArg(args, 'timeoutMs'),
                ...snapshotOptions
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
        case 'waitForNavigation':
            return WEB_WAIT_FOR_NAVIGATION_TOOL_NAME
        case 'waitForUrl':
            return WEB_WAIT_FOR_URL_TOOL_NAME
        case 'waitForText':
            return WEB_WAIT_FOR_TEXT_TOOL_NAME
        case 'waitForElement':
            return WEB_WAIT_FOR_ELEMENT_TOOL_NAME
        case 'waitForResultsChange':
            return WEB_WAIT_FOR_RESULTS_CHANGE_TOOL_NAME
        case 'scroll':
            return WEB_SCROLL_TOOL_NAME
        case 'clickAndWait':
            return WEB_CLICK_AND_WAIT_TOOL_NAME
        case 'typeAndSubmit':
            return WEB_TYPE_AND_SUBMIT_TOOL_NAME
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
                detail:
                    action.snapshotMode === 'focused'
                        ? `Coletando snapshot focado${action.focusText ? ` em "${action.focusText}"` : ''}.`
                        : 'Coletando o snapshot semantico da aba ativa.',
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
        case 'waitForNavigation':
            return {
                tone: 'executing',
                title: 'Aguardando navegacao',
                detail:
                    action.urlIncludes !== undefined
                        ? `Esperando URL com "${action.urlIncludes}".`
                        : 'Esperando troca de pagina ou nova navegacao.',
                toolName: WEB_WAIT_FOR_NAVIGATION_TOOL_NAME
            }
        case 'waitForUrl':
            return {
                tone: 'executing',
                title: 'Conferindo URL',
                detail: `Esperando URL correspondente a ${action.url}.`,
                toolName: WEB_WAIT_FOR_URL_TOOL_NAME
            }
        case 'waitForText':
            return {
                tone: 'executing',
                title: 'Esperando conteudo',
                detail: `Esperando o texto "${action.text}".`,
                toolName: WEB_WAIT_FOR_TEXT_TOOL_NAME
            }
        case 'waitForElement':
            return {
                tone: 'executing',
                title: 'Esperando elemento',
                detail:
                    action.targetId !== undefined
                        ? `Esperando o elemento ${action.targetId}.`
                        : `Esperando elemento com "${action.text ?? ''}".`,
                toolName: WEB_WAIT_FOR_ELEMENT_TOOL_NAME
            }
        case 'waitForResultsChange':
            return {
                tone: 'executing',
                title: 'Esperando novos resultados',
                detail:
                    action.minimumChange !== undefined
                        ? `Aguardando mudanca minima de ${action.minimumChange} itens visiveis.`
                        : 'Aguardando mudanca no conjunto de resultados.',
                toolName: WEB_WAIT_FOR_RESULTS_CHANGE_TOOL_NAME
            }
        case 'scroll':
            return {
                tone: 'executing',
                title: 'Rolando pagina',
                detail: `Rolando para ${action.direction}.`,
                toolName: WEB_SCROLL_TOOL_NAME
            }
        case 'clickAndWait':
            return {
                tone: 'executing',
                title: 'Clique com espera semantica',
                detail: `Clicando em ${action.targetId} e aguardando a proxima mudanca relevante.`,
                toolName: WEB_CLICK_AND_WAIT_TOOL_NAME
            }
        case 'typeAndSubmit':
            return {
                tone: 'executing',
                title: 'Envio com espera semantica',
                detail: `Digitando e enviando no elemento ${action.targetId}.`,
                toolName: WEB_TYPE_AND_SUBMIT_TOOL_NAME
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
        `Snapshot mode: ${snapshot.mode}`,
        `Page title: ${snapshot.title || 'Untitled page'}`,
        `Page URL: ${snapshot.url}`
    ]

    if (snapshot.focusText) {
        lines.push(`Focus hint: ${snapshot.focusText}`)
    }

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
            readiness: result.readiness,
            metrics: result.metrics,
            page: {
                title: result.snapshot.title,
                url: result.snapshot.url,
                generatedAt: result.snapshot.generatedAt,
                mode: result.snapshot.mode
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
