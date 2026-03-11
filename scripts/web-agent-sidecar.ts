import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import {
    chromium,
    type BrowserContext,
    type Locator,
    type Page
} from 'playwright'

type BrowserAgentRequest =
    | {
          id: string
          action: 'navigate'
          url: string
      }
    | {
          id: string
          action: 'snapshot'
      }
    | {
          id: string
          action: 'click'
          targetId: string
      }
    | {
          id: string
          action: 'type'
          targetId: string
          text: string
          submit?: boolean
      }
    | {
          id: string
          action: 'press'
          key: string
      }
    | {
          id: string
          action: 'wait'
          timeoutMs?: number
      }
    | {
          id: string
          action: 'scroll'
          direction: 'up' | 'down'
          amount?: number
      }

interface BrowserSnapshotHeading {
    tag: string
    text: string
}

interface BrowserSnapshotRegion {
    tag: string
    label?: string
    text: string
}

interface BrowserSnapshotElement {
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

interface BrowserPageSnapshot {
    title: string
    url: string
    headings: BrowserSnapshotHeading[]
    regions: BrowserSnapshotRegion[]
    elements: BrowserSnapshotElement[]
    generatedAt: string
}

interface BrowserAgentActionResult {
    action: BrowserAgentRequest['action']
    status: string
    detail: string
    snapshot: BrowserPageSnapshot
}

interface BrowserAgentResponse {
    id: string
    ok: boolean
    result?: BrowserAgentActionResult
    error?: string
}

const MAX_HEADINGS = 6
const MAX_REGIONS = 6
const MAX_ELEMENTS = 24
const MAX_REGION_TEXT_LENGTH = 180
const MAX_ELEMENT_TEXT_LENGTH = 120

let context: BrowserContext | null = null
let activePage: Page | null = null

async function getBrowserProfileDir() {
    const configuredPath = process.env.SPEEDAI_BROWSER_PROFILE_DIR?.trim()

    if (configuredPath && configuredPath.length > 0) {
        await mkdir(configuredPath, { recursive: true })
        return configuredPath
    }

    const fallbackPath = path.join(os.homedir(), '.speedai', 'browser-profile')

    await mkdir(fallbackPath, { recursive: true })

    return fallbackPath
}

function getHeadlessMode() {
    return process.env.SPEEDAI_BROWSER_HEADLESS === '1'
}

function normalizeUrl(url: string) {
    const trimmedUrl = url.trim()

    if (trimmedUrl.length === 0) {
        throw new Error('A URL recebida para navegacao esta vazia.')
    }

    if (
        trimmedUrl.startsWith('http://') ||
        trimmedUrl.startsWith('https://') ||
        trimmedUrl.startsWith('about:')
    ) {
        return trimmedUrl
    }

    return `https://${trimmedUrl}`
}

function clampNumber(
    value: number | undefined,
    minimum: number,
    maximum: number
) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return minimum
    }

    return Math.min(Math.max(Math.round(value), minimum), maximum)
}

function formatSidecarError(error: unknown) {
    const baseMessage =
        error instanceof Error && error.message.trim().length > 0
            ? error.message.trim()
            : 'A automacao web falhou sem detalhes adicionais.'

    if (
        baseMessage.includes('Executable does not exist') ||
        baseMessage.includes('Please run the following command')
    ) {
        return `${baseMessage} Execute "bunx playwright install chromium" no diretorio do projeto e tente novamente.`
    }

    return baseMessage
}

async function settlePage(page: Page, delayMs = 250) {
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)
    await page
        .waitForLoadState('networkidle', { timeout: 1500 })
        .catch(() => undefined)

    if (delayMs > 0) {
        await page.waitForTimeout(delayMs)
    }
}

async function ensurePage() {
    if (context === null) {
        const profileDir = await getBrowserProfileDir()

        context = await chromium.launchPersistentContext(profileDir, {
            headless: getHeadlessMode(),
            chromiumSandbox: false,
            args: ['--disable-setuid-sandbox', '--no-sandbox'],
            viewport: {
                width: 1440,
                height: 960
            }
        })

        context.setDefaultTimeout(12_000)
    }

    const existingPage = context.pages().find((page) => !page.isClosed())

    if (existingPage) {
        activePage = existingPage
    } else {
        activePage = await context.newPage()
    }

    return activePage
}

async function resolveTarget(page: Page, targetId: string) {
    const locator = page
        .locator(`[data-speedai-target-id="${targetId}"]`)
        .first()

    if ((await locator.count()) === 0) {
        throw new Error(
            `Nao encontrei o elemento ${targetId} na pagina atual. Gere um novo snapshot antes de tentar novamente.`
        )
    }

    return locator
}

async function fillLocator(page: Page, locator: Locator, text: string) {
    await locator.click()

    try {
        await locator.fill(text)
        return
    } catch {
        await locator.press('ControlOrMeta+A').catch(() => undefined)
        await locator.press('Backspace').catch(() => undefined)
        await locator.press('Delete').catch(() => undefined)
        await page.keyboard.insertText(text)
    }
}

async function captureSnapshot(page: Page): Promise<BrowserPageSnapshot> {
    return page.evaluate(
        ({
            maxElements,
            maxHeadings,
            maxRegions,
            maxRegionTextLength,
            maxElementTextLength
        }) => {
            const interactiveSelector = [
                'a[href]',
                'button',
                'input',
                'textarea',
                'select',
                '[role="button"]',
                '[role="link"]',
                '[role="textbox"]',
                '[role="searchbox"]',
                '[role="combobox"]',
                '[role="checkbox"]',
                '[role="radio"]',
                '[role="menuitem"]',
                '[contenteditable="true"]'
            ].join(',')
            const regionSelector = [
                'main',
                'nav',
                'header',
                'footer',
                'section',
                'article',
                'aside',
                'form'
            ].join(',')

            const normalizeWhitespace = (value: string) =>
                value.replace(/\s+/g, ' ').trim()
            const truncate = (value: string, length: number) => {
                const normalizedValue = normalizeWhitespace(value)

                if (normalizedValue.length <= length) {
                    return normalizedValue
                }

                return `${normalizedValue.slice(0, length - 1)}…`
            }
            const isElementVisible = (element: Element) => {
                if (!(element instanceof HTMLElement)) {
                    return false
                }

                const style = window.getComputedStyle(element)
                const rect = element.getBoundingClientRect()

                if (
                    style.display === 'none' ||
                    style.visibility === 'hidden' ||
                    Number(style.opacity) === 0
                ) {
                    return false
                }

                if (rect.width < 1 || rect.height < 1) {
                    return false
                }

                return rect.bottom >= 0 && rect.top <= window.innerHeight * 1.5
            }
            const getElementText = (element: Element, limit: number) => {
                if (element instanceof HTMLInputElement) {
                    return truncate(
                        element.value || element.placeholder || '',
                        limit
                    )
                }

                if (element instanceof HTMLTextAreaElement) {
                    return truncate(
                        element.value || element.placeholder || '',
                        limit
                    )
                }

                if (element instanceof HTMLSelectElement) {
                    return truncate(
                        element.selectedOptions[0]?.textContent ?? '',
                        limit
                    )
                }

                if (!(element instanceof HTMLElement)) {
                    return ''
                }

                return truncate(
                    element.innerText || element.textContent || '',
                    limit
                )
            }
            const getElementLabel = (element: Element, limit: number) => {
                if (!(element instanceof HTMLElement)) {
                    return ''
                }

                const ariaLabel = element.getAttribute('aria-label')

                if (ariaLabel) {
                    return truncate(ariaLabel, limit)
                }

                if (
                    element instanceof HTMLInputElement ||
                    element instanceof HTMLTextAreaElement ||
                    element instanceof HTMLSelectElement
                ) {
                    const firstLabel =
                        element.labels?.item(0)?.textContent ?? ''

                    if (firstLabel.trim().length > 0) {
                        return truncate(firstLabel, limit)
                    }
                }

                const labelAncestor = element.closest('label')

                if (labelAncestor instanceof HTMLElement) {
                    return truncate(labelAncestor.innerText, limit)
                }

                return ''
            }

            for (const element of document.querySelectorAll(
                '[data-speedai-target-id]'
            )) {
                element.removeAttribute('data-speedai-target-id')
            }

            const headings = Array.from(
                document.querySelectorAll('h1, h2, h3, h4, h5, h6')
            )
                .filter(isElementVisible)
                .map((element) => ({
                    tag: element.tagName.toLowerCase(),
                    text: truncate(
                        element.textContent ?? '',
                        maxRegionTextLength
                    )
                }))
                .filter((heading) => heading.text.length > 0)
                .slice(0, maxHeadings)

            const regions = Array.from(
                document.querySelectorAll(regionSelector)
            )
                .filter(isElementVisible)
                .map((element) => {
                    const label =
                        element.getAttribute('aria-label') ||
                        element.querySelector('h1, h2, h3, h4, h5, h6')
                            ?.textContent ||
                        ''

                    return {
                        tag: element.tagName.toLowerCase(),
                        label: truncate(label, 60),
                        text: truncate(
                            getElementText(element, maxRegionTextLength),
                            maxRegionTextLength
                        )
                    }
                })
                .filter(
                    (region) =>
                        region.label.length > 0 || region.text.length > 0
                )
                .slice(0, maxRegions)

            const elements = Array.from(
                document.querySelectorAll(interactiveSelector)
            )
                .filter(isElementVisible)
                .slice(0, maxElements)
                .map((element, index) => {
                    const targetId = `t${index + 1}`
                    element.setAttribute('data-speedai-target-id', targetId)

                    const text = getElementText(element, maxElementTextLength)
                    const label = getElementLabel(element, 80)
                    const role = element.getAttribute('role') ?? undefined
                    const href =
                        element instanceof HTMLAnchorElement
                            ? element.href
                            : (element.getAttribute('href') ?? undefined)
                    const type =
                        element instanceof HTMLInputElement
                            ? element.type
                            : (element.getAttribute('type') ?? undefined)
                    const placeholder =
                        element instanceof HTMLInputElement ||
                        element instanceof HTMLTextAreaElement
                            ? element.placeholder || undefined
                            : (element.getAttribute('placeholder') ?? undefined)
                    const disabled =
                        ((element instanceof HTMLButtonElement ||
                            element instanceof HTMLInputElement ||
                            element instanceof HTMLTextAreaElement ||
                            element instanceof HTMLSelectElement ||
                            element instanceof HTMLOptionElement) &&
                            element.disabled) ||
                        element.getAttribute('aria-disabled') === 'true'

                    return {
                        targetId,
                        tag: element.tagName.toLowerCase(),
                        role,
                        type,
                        text,
                        label,
                        placeholder,
                        href,
                        disabled
                    }
                })

            return {
                title: document.title || 'Untitled page',
                url: window.location.href,
                headings,
                regions,
                elements,
                generatedAt: new Date().toISOString()
            }
        },
        {
            maxElements: MAX_ELEMENTS,
            maxHeadings: MAX_HEADINGS,
            maxRegions: MAX_REGIONS,
            maxRegionTextLength: MAX_REGION_TEXT_LENGTH,
            maxElementTextLength: MAX_ELEMENT_TEXT_LENGTH
        }
    )
}

async function handleNavigateAction(
    request: Extract<BrowserAgentRequest, { action: 'navigate' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const nextUrl = normalizeUrl(request.url)

    await page.goto(nextUrl, {
        waitUntil: 'domcontentloaded'
    })
    await settlePage(page)

    const snapshot = await captureSnapshot(page)

    return {
        action: request.action,
        status: 'Pagina carregada',
        detail: `${snapshot.title} em ${snapshot.url}`,
        snapshot
    }
}

async function handleSnapshotAction(
    request: Extract<BrowserAgentRequest, { action: 'snapshot' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const snapshot = await captureSnapshot(page)

    return {
        action: request.action,
        status: 'Pagina inspecionada',
        detail: `${snapshot.elements.length} elementos interativos visiveis encontrados.`,
        snapshot
    }
}

async function handleClickAction(
    request: Extract<BrowserAgentRequest, { action: 'click' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const locator = await resolveTarget(page, request.targetId)

    await locator.click()
    await settlePage(page)

    const snapshot = await captureSnapshot(page)

    return {
        action: request.action,
        status: 'Clique executado',
        detail: `Elemento ${request.targetId} acionado.`,
        snapshot
    }
}

async function handleTypeAction(
    request: Extract<BrowserAgentRequest, { action: 'type' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const locator = await resolveTarget(page, request.targetId)

    await fillLocator(page, locator, request.text)

    if (request.submit) {
        await locator.press('Enter').catch(() => page.keyboard.press('Enter'))
    }

    await settlePage(page)

    const snapshot = await captureSnapshot(page)

    return {
        action: request.action,
        status: 'Campo preenchido',
        detail: `Texto aplicado no elemento ${request.targetId}.`,
        snapshot
    }
}

async function handlePressAction(
    request: Extract<BrowserAgentRequest, { action: 'press' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()

    await page.keyboard.press(request.key)
    await settlePage(page)

    const snapshot = await captureSnapshot(page)

    return {
        action: request.action,
        status: 'Tecla enviada',
        detail: `Tecla ${request.key} pressionada na pagina.`,
        snapshot
    }
}

async function handleWaitAction(
    request: Extract<BrowserAgentRequest, { action: 'wait' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const timeoutMs = clampNumber(request.timeoutMs, 400, 10_000)

    await page.waitForTimeout(timeoutMs)
    await settlePage(page, 0)

    const snapshot = await captureSnapshot(page)

    return {
        action: request.action,
        status: 'Pagina atualizada',
        detail: `Aguardados ${timeoutMs} ms para estabilizacao.`,
        snapshot
    }
}

async function handleScrollAction(
    request: Extract<BrowserAgentRequest, { action: 'scroll' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const amount = clampNumber(request.amount, 480, 1600)
    const deltaY = request.direction === 'down' ? amount : amount * -1

    await page.mouse.wheel(0, deltaY)
    await page.waitForTimeout(350)

    const snapshot = await captureSnapshot(page)

    return {
        action: request.action,
        status: 'Pagina rolada',
        detail: `Rolagem aplicada para ${request.direction} (${amount}px).`,
        snapshot
    }
}

async function handleRequest(
    request: BrowserAgentRequest
): Promise<BrowserAgentActionResult> {
    switch (request.action) {
        case 'navigate':
            return handleNavigateAction(request)
        case 'snapshot':
            return handleSnapshotAction(request)
        case 'click':
            return handleClickAction(request)
        case 'type':
            return handleTypeAction(request)
        case 'press':
            return handlePressAction(request)
        case 'wait':
            return handleWaitAction(request)
        case 'scroll':
            return handleScrollAction(request)
    }
}

function writeResponse(response: BrowserAgentResponse) {
    process.stdout.write(`${JSON.stringify(response)}\n`)
}

async function closeContext() {
    if (context === null) {
        return
    }

    await context.close().catch(() => undefined)
    context = null
    activePage = null
}

async function main() {
    const input = createInterface({
        input: process.stdin,
        crlfDelay: Infinity
    })

    process.stdout.write('READY\n')

    for await (const line of input) {
        const trimmedLine = line.trim()

        if (trimmedLine.length === 0) {
            continue
        }

        let request: BrowserAgentRequest

        try {
            request = JSON.parse(trimmedLine) as BrowserAgentRequest
        } catch (error) {
            writeResponse({
                id: 'invalid-request',
                ok: false,
                error: `Nao foi possivel interpretar a requisicao enviada ao sidecar: ${formatSidecarError(
                    error
                )}`
            })
            continue
        }

        try {
            const result = await handleRequest(request)

            writeResponse({
                id: request.id,
                ok: true,
                result
            })
        } catch (error) {
            writeResponse({
                id: request.id,
                ok: false,
                error: formatSidecarError(error)
            })
        }
    }
}

process.on('SIGINT', () => {
    void closeContext().finally(() => process.exit(0))
})

process.on('SIGTERM', () => {
    void closeContext().finally(() => process.exit(0))
})

void main().catch(async (error) => {
    console.error(formatSidecarError(error))
    await closeContext()
    process.exit(1)
})
