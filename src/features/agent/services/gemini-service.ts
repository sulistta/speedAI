import {
    createPartFromFunctionResponse,
    GoogleGenAI,
    type FunctionCall,
    type FunctionDeclaration,
    FunctionCallingConfigMode
} from '@google/genai'
import {
    MAX_AGENT_TOOL_STEPS,
    normalizeGeminiModelId
} from '@/features/agent/constants'
import {
    browserSystemInstruction,
    browserToolDefinitions,
    buildToolErrorPayload,
    buildToolResponsePayload,
    describeAction,
    getToolName,
    parseBrowserToolArguments
} from '@/features/agent/services/browser-tooling'
import { executeBrowserAgentAction } from '@/features/agent/services/desktop-actions'
import type {
    AgentExecutionStatus,
    AgentRunResult
} from '@/features/agent/types'
import { getErrorMessage } from '@/features/agent/utils'

const browserToolDeclarations: FunctionDeclaration[] =
    browserToolDefinitions.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.parametersSchema
    }))

function parseBrowserToolCall(functionCall: FunctionCall) {
    return parseBrowserToolArguments(
        functionCall.name ?? '',
        functionCall.args as Record<string, unknown> | undefined
    )
}

export async function runGeminiAgentCommand(
    input: string,
    apiKey: string,
    modelId: string,
    onStatus?: (status: AgentExecutionStatus) => void
): Promise<AgentRunResult> {
    const cleanedInput = input.trim()
    const cleanedApiKey = apiKey.trim()
    const cleanedModelId = normalizeGeminiModelId(modelId)

    if (cleanedInput.length === 0) {
        throw new Error('Digite um comando antes de enviar.')
    }

    if (cleanedApiKey.length === 0) {
        throw new Error(
            'Salve sua API Key do Gemini antes de executar comandos.'
        )
    }

    const ai = new GoogleGenAI({ apiKey: cleanedApiKey })
    const chat = ai.chats.create({
        model: cleanedModelId,
        config: {
            systemInstruction: browserSystemInstruction,
            temperature: 0.2,
            maxOutputTokens: 768,
            toolConfig: {
                functionCallingConfig: {
                    mode: FunctionCallingConfigMode.AUTO
                }
            },
            tools: [
                {
                    functionDeclarations: browserToolDeclarations
                }
            ]
        }
    })

    let response = await chat.sendMessage({
        message: cleanedInput
    })

    for (let step = 1; step <= MAX_AGENT_TOOL_STEPS; step += 1) {
        const functionCalls = response.functionCalls ?? []

        if (functionCalls.length === 0) {
            if (response.text?.trim().length) {
                return {
                    message: response.text.trim(),
                    stepCount: step - 1
                }
            }

            throw new Error(
                'O Gemini nao retornou texto nem uma chamada de ferramenta utilizavel.'
            )
        }

        if (functionCalls.length > 1) {
            throw new Error(
                'O Gemini tentou chamar mais de uma ferramenta ao mesmo tempo.'
            )
        }

        const functionCall = functionCalls[0]
        const parsedToolCall = parseBrowserToolCall(functionCall)

        onStatus?.(describeAction(parsedToolCall))

        try {
            const executionResult =
                await executeBrowserAgentAction(parsedToolCall)

            onStatus?.({
                tone: 'info',
                title: executionResult.status,
                detail: executionResult.detail,
                toolName: getToolName(parsedToolCall)
            })

            response = await chat.sendMessage({
                message: [
                    createPartFromFunctionResponse(
                        functionCall.id ?? `tool-step-${step}`,
                        functionCall.name ?? getToolName(parsedToolCall),
                        buildToolResponsePayload(executionResult, step)
                    )
                ]
            })
        } catch (error) {
            onStatus?.({
                tone: 'error',
                title: 'Acao bloqueada',
                detail: getErrorMessage(error),
                toolName: getToolName(parsedToolCall)
            })

            response = await chat.sendMessage({
                message: [
                    createPartFromFunctionResponse(
                        functionCall.id ?? `tool-step-${step}`,
                        functionCall.name ?? getToolName(parsedToolCall),
                        buildToolErrorPayload(error, step)
                    )
                ]
            })
        }
    }

    if (response.text?.trim().length) {
        return {
            message: response.text.trim(),
            stepCount: MAX_AGENT_TOOL_STEPS
        }
    }

    throw new Error(
        `O agente atingiu o limite de ${MAX_AGENT_TOOL_STEPS} etapas sem concluir a tarefa.`
    )
}
