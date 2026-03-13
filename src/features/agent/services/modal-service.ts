import {
    MODAL_MAX_OUTPUT_TOKENS,
    normalizeModalModelId
} from '@/features/agent/constants'
import {
    browserSystemInstruction,
    buildOpenAICompatibleTools,
    buildToolErrorPayload,
    buildToolResponsePayload,
    describeAction,
    getToolName,
    parseBrowserToolArguments
} from '@/features/agent/services/browser-tooling'
import {
    executeBrowserAgentAction,
    executeModalChatCompletion
} from '@/features/agent/services/desktop-actions'
import { createExecutionMetricsTracker } from '@/features/agent/services/execution-metrics'
import type {
    AgentExecutionStatus,
    AgentRunResult,
    ModalChatMessage,
    ModalToolCall
} from '@/features/agent/types'
import { getErrorMessage } from '@/features/agent/utils'

function parseToolArguments(serializedArgs: string) {
    if (serializedArgs.trim().length === 0) {
        return undefined
    }

    const parsed = JSON.parse(serializedArgs) as unknown

    if (
        parsed === null ||
        Array.isArray(parsed) ||
        typeof parsed !== 'object'
    ) {
        throw new Error(
            'O Modal retornou argumentos de tool em um formato invalido.'
        )
    }

    return parsed as Record<string, unknown>
}

function parseModalToolCall(toolCall: ModalToolCall) {
    return parseBrowserToolArguments(
        toolCall.function.name,
        parseToolArguments(toolCall.function.arguments)
    )
}

async function requestModalCompletion(
    apiKey: string,
    messages: ModalChatMessage[],
    modelId: string,
    thinkingEnabled: boolean
) {
    const response = await executeModalChatCompletion({
        apiKey,
        model: modelId,
        messages,
        tools: buildOpenAICompatibleTools(),
        toolChoice: 'auto',
        thinkingEnabled,
        temperature: 0.2,
        maxTokens: MODAL_MAX_OUTPUT_TOKENS
    })
    const choice = response.choices?.[0]

    if (!choice?.message) {
        throw new Error(
            'O Modal nao retornou uma resposta utilizavel em chat/completions.'
        )
    }

    return choice.message
}

export async function runModalAgentCommand(
    input: string,
    apiKey: string,
    modelId: string,
    thinkingEnabled: boolean,
    maxAgentToolSteps: number,
    onStatus?: (status: AgentExecutionStatus) => void
): Promise<AgentRunResult> {
    const tracker = createExecutionMetricsTracker()
    const startedAt = Date.now()
    const cleanedInput = input.trim()
    const cleanedApiKey = apiKey.trim()
    const cleanedModelId = normalizeModalModelId(modelId)
    const messages: ModalChatMessage[] = [
        {
            role: 'system',
            content: browserSystemInstruction
        },
        {
            role: 'user',
            content: cleanedInput
        }
    ]

    if (cleanedInput.length === 0) {
        throw new Error('Digite um comando antes de enviar.')
    }

    if (cleanedApiKey.length === 0) {
        throw new Error(
            'Salve sua API Key do Modal antes de executar comandos.'
        )
    }

    async function requestCompletion(messagesBatch: ModalChatMessage[]) {
        const llmStartedAt = Date.now()
        const responseMessage = await requestModalCompletion(
            cleanedApiKey,
            messagesBatch,
            cleanedModelId,
            thinkingEnabled
        )

        tracker.recordLLMCall(Date.now() - llmStartedAt)

        return responseMessage
    }

    let responseMessage = await requestCompletion(messages)

    for (let step = 1; step <= maxAgentToolSteps; step += 1) {
        const toolCalls = responseMessage.tool_calls ?? []

        if (toolCalls.length === 0) {
            if (responseMessage.content?.trim().length) {
                return {
                    message: responseMessage.content.trim(),
                    stepCount: step - 1,
                    metrics: tracker.finalize(Date.now() - startedAt, step - 1)
                }
            }

            throw new Error(
                'O Modal nao retornou texto nem uma chamada de ferramenta utilizavel.'
            )
        }

        if (toolCalls.length > 1) {
            throw new Error(
                'O Modal tentou chamar mais de uma ferramenta ao mesmo tempo.'
            )
        }

        const toolCall = toolCalls[0]
        const parsedToolCall = parseModalToolCall(toolCall)

        messages.push({
            role: 'assistant',
            content: responseMessage.content ?? null,
            tool_calls: toolCalls
        })

        onStatus?.(describeAction(parsedToolCall))

        try {
            const executionResult =
                await executeBrowserAgentAction(parsedToolCall)

            tracker.recordToolResult(executionResult)

            onStatus?.({
                tone: 'info',
                title: executionResult.status,
                detail: executionResult.detail,
                toolName: getToolName(parsedToolCall)
            })

            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(
                    buildToolResponsePayload(executionResult, step)
                )
            })
        } catch (error) {
            onStatus?.({
                tone: 'error',
                title: 'Acao bloqueada',
                detail: getErrorMessage(error),
                toolName: getToolName(parsedToolCall)
            })

            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(buildToolErrorPayload(error, step))
            })
        }

        responseMessage = await requestCompletion(messages)
    }

    if (responseMessage.content?.trim().length) {
        return {
            message: responseMessage.content.trim(),
            stepCount: maxAgentToolSteps,
            metrics: tracker.finalize(Date.now() - startedAt, maxAgentToolSteps)
        }
    }

    throw new Error(
        `O agente atingiu o limite de ${maxAgentToolSteps} etapas sem concluir a tarefa.`
    )
}
