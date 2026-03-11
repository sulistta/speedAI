import type {
    FunctionCall,
    FunctionDeclaration,
    FunctionCallingConfigMode
} from '@google/genai'
import { GEMINI_MODEL_ID, WHATSAPP_TOOL_NAME } from '@/features/agent/constants'
import type {
    AgentRunResult,
    WhatsappToolArguments
} from '@/features/agent/types'

const systemInstruction = `You are a desktop automation agent running inside a Tauri desktop assistant.
Interpret the user's request and decide whether you should call the available tool.
Only call open_whatsapp_and_send_message when the user clearly wants to send a WhatsApp message.
When you call the tool:
- extract only the contact display name as "contact"
- preserve the intended message wording as "message"
- do not add extra text, signatures, greetings, or explanations
If the current tool is not enough for the user's request, answer briefly in plain text describing the limitation.`

const whatsappToolDeclaration: FunctionDeclaration = {
    name: WHATSAPP_TOOL_NAME,
    description:
        'Open WhatsApp Web and prepare a message flow for the target contact.',
    parametersJsonSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            contact: {
                type: 'string',
                description:
                    'The recipient display name exactly as the user identifies the contact.'
            },
            message: {
                type: 'string',
                description: 'The message body that should be sent on WhatsApp.'
            }
        },
        required: ['contact', 'message']
    }
}

function readRequiredStringArg(
    args: Record<string, unknown> | undefined,
    key: keyof WhatsappToolArguments
) {
    const value = args?.[key]

    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(
            `O Gemini retornou uma chamada de funcao sem o campo obrigatorio "${key}".`
        )
    }

    return value.trim()
}

function parseWhatsappToolCall(functionCall: FunctionCall): AgentRunResult {
    if (functionCall.name !== WHATSAPP_TOOL_NAME) {
        throw new Error('O modelo tentou chamar uma ferramenta nao suportada.')
    }

    const args = functionCall.args as Record<string, unknown> | undefined

    return {
        kind: 'tool-call',
        toolCall: {
            name: WHATSAPP_TOOL_NAME,
            args: {
                contact: readRequiredStringArg(args, 'contact'),
                message: readRequiredStringArg(args, 'message')
            }
        }
    }
}

export async function runDesktopAgentCommand(
    input: string,
    apiKey: string
): Promise<AgentRunResult> {
    const cleanedInput = input.trim()
    const cleanedApiKey = apiKey.trim()

    if (cleanedInput.length === 0) {
        throw new Error('Digite um comando antes de enviar.')
    }

    if (cleanedApiKey.length === 0) {
        throw new Error(
            'Salve sua API Key do Gemini antes de executar comandos.'
        )
    }

    const { FunctionCallingConfigMode, GoogleGenAI } =
        await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: cleanedApiKey })
    const response = await ai.models.generateContent({
        model: GEMINI_MODEL_ID,
        contents: cleanedInput,
        config: {
            systemInstruction,
            temperature: 0.2,
            maxOutputTokens: 512,
            toolConfig: {
                functionCallingConfig: {
                    mode: FunctionCallingConfigMode.AUTO as FunctionCallingConfigMode
                }
            },
            tools: [
                {
                    functionDeclarations: [whatsappToolDeclaration]
                }
            ]
        }
    })

    const whatsappToolCall = response.functionCalls?.find(
        (functionCall) => functionCall.name === WHATSAPP_TOOL_NAME
    )

    if (whatsappToolCall !== undefined) {
        const parsedToolCall = parseWhatsappToolCall(whatsappToolCall)

        if (response.text?.trim().length) {
            return {
                ...parsedToolCall,
                message: response.text.trim()
            }
        }

        return parsedToolCall
    }

    if (response.text?.trim().length) {
        return {
            kind: 'text',
            message: response.text.trim()
        }
    }

    throw new Error(
        'O Gemini nao retornou texto nem uma chamada de ferramenta utilizavel.'
    )
}
