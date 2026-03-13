import { mkdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import {
    chromium,
    type BrowserContext,
    type Locator,
    type Page
} from 'playwright'

type BrowserSnapshotMode = 'full' | 'interactive' | 'focused' | 'delta'

interface BrowserSnapshotOptions {
    snapshotMode?: BrowserSnapshotMode
    focusText?: string
}

type BrowserAgentRequest =
    | ({
          id: string
          action: 'navigate'
          url: string
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'snapshot'
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'click'
          targetId: string
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'type'
          targetId: string
          text: string
          submit?: boolean
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'press'
          key: string
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'wait'
          timeoutMs?: number
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'waitForNavigation'
          timeoutMs?: number
          urlIncludes?: string
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'waitForUrl'
          url: string
          timeoutMs?: number
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'waitForText'
          text: string
          timeoutMs?: number
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'waitForElement'
          targetId?: string
          text?: string
          timeoutMs?: number
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'waitForResultsChange'
          timeoutMs?: number
          minimumChange?: number
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'scroll'
          direction: 'up' | 'down'
          amount?: number
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'clickAndWait'
          targetId: string
          waitForText?: string
          waitForUrl?: string
          timeoutMs?: number
      } & BrowserSnapshotOptions)
    | ({
          id: string
          action: 'typeAndSubmit'
          targetId: string
          text: string
          waitForText?: string
          waitForUrl?: string
          timeoutMs?: number
      } & BrowserSnapshotOptions)

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
    mode: BrowserSnapshotMode
    focusText?: string
    generatedAt: string
}

interface BrowserAgentReadiness {
    state: 'stable' | 'changed'
    detail: string
    urlChanged: boolean
    contentChanged: boolean
}

interface BrowserAgentMetrics {
    actionDurationMs: number
    settleDurationMs: number
    snapshotDurationMs: number
    snapshotBytes: number
    snapshotMode: BrowserSnapshotMode
    snapshotElementCount: number
    snapshotHeadingCount: number
    snapshotRegionCount: number
}

interface BrowserAgentActionResult {
    action: BrowserAgentRequest['action']
    status: string
    detail: string
    snapshot: BrowserPageSnapshot
    readiness: BrowserAgentReadiness
    metrics: BrowserAgentMetrics
}

interface BrowserAgentResponse {
    id: string
    ok: boolean
    result?: BrowserAgentActionResult
    error?: string
}

interface ActionContext {
    startedAt: number
    beforeUrl: string
    beforeSnapshot: BrowserPageSnapshot | null
}

const INTERACTIVE_SELECTOR = [
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

const REGION_SELECTOR = [
    'main',
    'nav',
    'header',
    'footer',
    'section',
    'article',
    'aside',
    'form'
].join(',')

const DEFAULT_WAIT_TIMEOUT_MS = 4_000
const DEFAULT_POST_ACTION_SNAPSHOT_MODE: BrowserSnapshotMode = 'delta'
const MAX_HEADINGS = 6
const MAX_REGIONS = 6
const MAX_ELEMENTS = 32
const MAX_REGION_TEXT_LENGTH = 180
const MAX_ELEMENT_TEXT_LENGTH = 120

let context: BrowserContext | null = null
let activePage: Page | null = null
let lastRawSnapshot: BrowserPageSnapshot | null = null

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

async function resolveBrowserExecutablePath() {
    const configuredPath = process.env.SPEEDAI_BROWSER_EXECUTABLE_PATH?.trim()

    if (configuredPath) {
        try {
            await stat(configuredPath)
            return configuredPath
        } catch {
            throw new Error(
                `O executavel configurado em SPEEDAI_BROWSER_EXECUTABLE_PATH nao existe em ${configuredPath}.`
            )
        }
    }

    const executablePath = chromium.executablePath()

    if (!executablePath) {
        throw new Error(
            'Nao encontrei um navegador pronto para a automacao web. Gere os recursos empacotados com "bun run prepare:web-agent" ou instale o Chromium do Playwright no ambiente de desenvolvimento.'
        )
    }

    try {
        await stat(executablePath)
        return executablePath
    } catch {
        throw new Error(
            'Nao encontrei um navegador pronto para a automacao web. Gere os recursos empacotados com "bun run prepare:web-agent" ou instale o Chromium do Playwright no ambiente de desenvolvimento.'
        )
    }
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

function resolveTimeoutMs(value: number | undefined) {
    return clampNumber(value ?? DEFAULT_WAIT_TIMEOUT_MS, 400, 12_000)
}

function resolveSnapshotMode(
    mode: BrowserSnapshotMode | undefined,
    fallbackMode: BrowserSnapshotMode
) {
    return mode ?? fallbackMode
}

function normalizeText(value: string) {
    return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function formatSidecarError(error: unknown) {
    const baseMessage =
        error instanceof Error && error.message.trim().length > 0
            ? error.message.trim()
            : 'A automacao web falhou sem detalhes adicionais.'

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

function listOpenPages(browserContext: BrowserContext) {
    return browserContext.pages().filter((page) => !page.isClosed())
}

function isBrowserInternalPage(page: Page) {
    const currentUrl = page.url().trim().toLowerCase()

    return (
        currentUrl.startsWith('chrome://') ||
        currentUrl.startsWith('chrome-extension://') ||
        currentUrl.startsWith('edge://') ||
        currentUrl.startsWith('devtools://')
    )
}

function pickStartupPage(pages: Page[]) {
    return [...pages].reverse().find((page) => !isBrowserInternalPage(page))
}

async function ensurePage() {
    const shouldAdoptStartupPage = context === null

    if (context === null) {
        const profileDir = await getBrowserProfileDir()
        const browserExecutablePath = await resolveBrowserExecutablePath()

        context = await chromium.launchPersistentContext(profileDir, {
            executablePath: browserExecutablePath,
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

    if (activePage && !activePage.isClosed()) {
        await activePage.bringToFront().catch(() => undefined)
        return activePage
    }

    if (shouldAdoptStartupPage) {
        const existingPages = listOpenPages(context)
        const existingPage = pickStartupPage(existingPages)

        if (existingPage) {
            activePage = existingPage
        } else {
            activePage = await context.newPage()
        }
    } else {
        activePage = await context.newPage()
    }

    await activePage.bringToFront().catch(() => undefined)

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

function createSnapshotView(
    baseSnapshot: BrowserPageSnapshot,
    mode: BrowserSnapshotMode,
    focusText?: string
): BrowserPageSnapshot {
    return {
        title: baseSnapshot.title,
        url: baseSnapshot.url,
        headings: [...baseSnapshot.headings],
        regions: [...baseSnapshot.regions],
        elements: [...baseSnapshot.elements],
        mode,
        focusText,
        generatedAt: baseSnapshot.generatedAt
    }
}

function buildElementSignature(element: BrowserSnapshotElement) {
    return [
        element.tag,
        element.role ?? '',
        element.type ?? '',
        element.label ?? '',
        element.text,
        element.placeholder ?? '',
        element.href ?? '',
        element.disabled ? '1' : '0'
    ].join('|')
}

function buildContentSignature(snapshot: BrowserPageSnapshot) {
    return [
        snapshot.title,
        snapshot.url,
        snapshot.headings.map((item) => `${item.tag}:${item.text}`).join('||'),
        snapshot.regions
            .map((item) => `${item.tag}:${item.label ?? ''}:${item.text}`)
            .join('||'),
        snapshot.elements.map(buildElementSignature).join('||')
    ].join('###')
}

function scoreFocusMatch(value: string, focusTokens: string[]) {
    if (focusTokens.length === 0) {
        return 0
    }

    const normalizedValue = normalizeText(value)

    if (normalizedValue.length === 0) {
        return 0
    }

    return focusTokens.reduce((score, token) => {
        if (!normalizedValue.includes(token)) {
            return score
        }

        if (normalizedValue === token) {
            return score + 14
        }

        if (normalizedValue.startsWith(token)) {
            return score + 10
        }

        return score + 6
    }, 0)
}

function applyFocusToSnapshot(
    snapshot: BrowserPageSnapshot,
    focusText: string | undefined,
    mode: BrowserSnapshotMode
) {
    const normalizedFocusText = focusText?.trim()

    if (!normalizedFocusText) {
        return {
            ...snapshot,
            mode
        }
    }

    const focusTokens = normalizedFocusText
        .split(/\s+/)
        .map(normalizeText)
        .filter((token) => token.length > 0)

    const headings = snapshot.headings
        .map((heading) => ({
            score: scoreFocusMatch(heading.text, focusTokens),
            heading
        }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((item) => item.heading)
        .slice(0, 6)

    const regions = snapshot.regions
        .map((region) => ({
            score:
                scoreFocusMatch(region.label ?? '', focusTokens) * 1.2 +
                scoreFocusMatch(region.text, focusTokens),
            region
        }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((item) => item.region)
        .slice(0, 6)

    const elements = snapshot.elements
        .map((element) => ({
            score:
                scoreFocusMatch(element.label ?? '', focusTokens) * 1.25 +
                scoreFocusMatch(element.text, focusTokens) +
                scoreFocusMatch(element.placeholder ?? '', focusTokens) +
                scoreFocusMatch(element.href ?? '', focusTokens) * 0.6,
            element
        }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((item) => item.element)
        .slice(0, 16)

    if (
        headings.length === 0 &&
        regions.length === 0 &&
        elements.length === 0
    ) {
        return {
            ...snapshot,
            mode,
            focusText: normalizedFocusText,
            headings: snapshot.headings.slice(0, 3),
            regions: snapshot.regions.slice(0, 3),
            elements: snapshot.elements.slice(0, 12)
        }
    }

    return {
        ...snapshot,
        mode,
        focusText: normalizedFocusText,
        headings,
        regions,
        elements
    }
}

function buildDeltaSnapshot(
    currentSnapshot: BrowserPageSnapshot,
    previousSnapshot: BrowserPageSnapshot | null
) {
    if (!previousSnapshot || previousSnapshot.url !== currentSnapshot.url) {
        return createSnapshotView(currentSnapshot, 'delta')
    }

    const previousHeadingKeys = new Set(
        previousSnapshot.headings.map((item) => `${item.tag}:${item.text}`)
    )
    const previousRegionKeys = new Set(
        previousSnapshot.regions.map(
            (item) => `${item.tag}:${item.label ?? ''}:${item.text}`
        )
    )
    const previousElementKeys = new Set(
        previousSnapshot.elements.map(buildElementSignature)
    )

    const headings = currentSnapshot.headings
        .filter((item) => !previousHeadingKeys.has(`${item.tag}:${item.text}`))
        .slice(0, 4)
    const regions = currentSnapshot.regions
        .filter(
            (item) =>
                !previousRegionKeys.has(
                    `${item.tag}:${item.label ?? ''}:${item.text}`
                )
        )
        .slice(0, 4)
    const elements = currentSnapshot.elements
        .filter((item) => !previousElementKeys.has(buildElementSignature(item)))
        .slice(0, 16)

    if (
        headings.length === 0 &&
        regions.length === 0 &&
        elements.length === 0
    ) {
        return {
            ...createSnapshotView(currentSnapshot, 'delta'),
            headings: [],
            regions: [],
            elements: currentSnapshot.elements.slice(0, 8)
        }
    }

    return {
        ...createSnapshotView(currentSnapshot, 'delta'),
        headings,
        regions,
        elements
    }
}

function applySnapshotMode(
    rawSnapshot: BrowserPageSnapshot,
    previousSnapshot: BrowserPageSnapshot | null,
    mode: BrowserSnapshotMode,
    focusText?: string
) {
    switch (mode) {
        case 'full':
            return {
                ...createSnapshotView(rawSnapshot, mode),
                focusText
            }
        case 'interactive':
            return {
                ...createSnapshotView(rawSnapshot, mode),
                headings: [],
                regions: [],
                elements: rawSnapshot.elements.slice(0, 20),
                focusText
            }
        case 'focused':
            return applyFocusToSnapshot(
                {
                    ...createSnapshotView(rawSnapshot, mode),
                    headings: rawSnapshot.headings.slice(0, 6),
                    regions: rawSnapshot.regions.slice(0, 6),
                    elements: rawSnapshot.elements.slice(0, 20)
                },
                focusText,
                mode
            )
        case 'delta':
            return applyFocusToSnapshot(
                buildDeltaSnapshot(rawSnapshot, previousSnapshot),
                focusText,
                mode
            )
    }
}

async function captureRawSnapshot(page: Page): Promise<BrowserPageSnapshot> {
    const rawSnapshot = await page.evaluate(
        ({
            interactiveSelector,
            regionSelector,
            maxElements,
            maxHeadings,
            maxRegions,
            maxRegionTextLength,
            maxElementTextLength
        }) => {
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

                const titleAttribute = element.getAttribute('title')

                if (titleAttribute) {
                    return truncate(titleAttribute, limit)
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
            const getElementHref = (element: Element) =>
                element instanceof HTMLAnchorElement
                    ? element.href
                    : (element.getAttribute('href') ?? '')
            const getElementPlaceholder = (element: Element) =>
                element instanceof HTMLInputElement ||
                element instanceof HTMLTextAreaElement
                    ? element.placeholder || ''
                    : (element.getAttribute('placeholder') ?? '')
            const isInputLikeElement = (element: Element) =>
                element instanceof HTMLInputElement ||
                element instanceof HTMLTextAreaElement ||
                element instanceof HTMLSelectElement ||
                element.getAttribute('role') === 'textbox' ||
                element.getAttribute('role') === 'searchbox' ||
                element.getAttribute('role') === 'combobox' ||
                element.getAttribute('contenteditable') === 'true'
            const hasContentContainer = (element: Element) =>
                Boolean(
                    element.closest(
                        [
                            'article',
                            '[role="article"]',
                            'li',
                            'main',
                            'section',
                            'ytd-video-renderer',
                            'ytd-rich-item-renderer',
                            'ytd-rich-grid-media',
                            'ytd-compact-video-renderer',
                            'yt-lockup-view-model',
                            '[class*="card"]',
                            '[class*="result"]',
                            '[class*="tile"]'
                        ].join(',')
                    )
                )
            const buildDedupeKey = (
                element: Element,
                href: string,
                text: string,
                label: string,
                placeholder: string
            ) => {
                if (href.length > 0) {
                    return `href:${href}`
                }

                const descriptor = text || label || placeholder

                if (descriptor.length > 0) {
                    return [
                        element.tagName.toLowerCase(),
                        element.getAttribute('role') ?? '',
                        descriptor
                    ].join('|')
                }

                const rect = element.getBoundingClientRect()

                return `position:${rect.top}:${rect.left}:${element.tagName.toLowerCase()}`
            }
            const computeSelectionScore = (
                element: Element,
                text: string,
                label: string,
                placeholder: string,
                href: string
            ) => {
                if (!(element instanceof HTMLElement)) {
                    return Number.NEGATIVE_INFINITY
                }

                const rect = element.getBoundingClientRect()
                const role = element.getAttribute('role') ?? ''
                const descriptorLength = Math.max(
                    text.length,
                    label.length,
                    placeholder.length
                )
                const isInputLike = isInputLikeElement(element)
                const isLinkLike =
                    element instanceof HTMLAnchorElement || role === 'link'
                const isTinyControl = rect.width <= 72 && rect.height <= 72
                const isMediaCandidate =
                    href.includes('/watch') ||
                    href.includes('/playlist') ||
                    href.includes('/shorts/') ||
                    href.includes('/results?search_query=')

                let score = 0

                if (isInputLike) {
                    score += 460
                }

                if (isLinkLike) {
                    score += 180
                }

                if (hasContentContainer(element)) {
                    score += 200
                }

                if (href.length > 0) {
                    score += 140
                }

                if (isMediaCandidate) {
                    score += 260
                }

                score += Math.min(descriptorLength, 120)

                if (text.length > 0) {
                    score += 80
                }

                if (label.length > 0) {
                    score += 40
                }

                if (placeholder.length > 0) {
                    score += 60
                }

                if (rect.top >= 0) {
                    score += Math.max(0, 220 - Math.min(rect.top, 220))
                } else {
                    score -= 120
                }

                if (rect.height * rect.width >= 24_000) {
                    score += 40
                }

                if (isTinyControl) {
                    score -= 140
                }

                if (
                    descriptorLength === 0 &&
                    href.length === 0 &&
                    !isInputLike
                ) {
                    score -= 240
                }

                if (element.getAttribute('aria-hidden') === 'true') {
                    score -= 40
                }

                return score
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
                .map((element) => {
                    const rect = element.getBoundingClientRect()
                    const text = getElementText(element, maxElementTextLength)
                    const label = getElementLabel(element, 80)
                    const href = getElementHref(element)
                    const placeholder = getElementPlaceholder(element)
                    const role = element.getAttribute('role') ?? undefined
                    const type =
                        element instanceof HTMLInputElement
                            ? element.type
                            : (element.getAttribute('type') ?? undefined)
                    const disabled =
                        ((element instanceof HTMLButtonElement ||
                            element instanceof HTMLInputElement ||
                            element instanceof HTMLTextAreaElement ||
                            element instanceof HTMLSelectElement ||
                            element instanceof HTMLOptionElement) &&
                            element.disabled) ||
                        element.getAttribute('aria-disabled') === 'true'

                    return {
                        element,
                        rectTop: rect.top,
                        rectLeft: rect.left,
                        dedupeKey: buildDedupeKey(
                            element,
                            href,
                            text,
                            label,
                            placeholder
                        ),
                        score: computeSelectionScore(
                            element,
                            text,
                            label,
                            placeholder,
                            href
                        ),
                        descriptorLength: Math.max(
                            text.length,
                            label.length,
                            placeholder.length
                        ),
                        tag: element.tagName.toLowerCase(),
                        role,
                        type,
                        text,
                        label,
                        placeholder: placeholder || undefined,
                        href: href || undefined,
                        disabled
                    }
                })
                .reduce<
                    Array<{
                        element: Element
                        rectTop: number
                        rectLeft: number
                        dedupeKey: string
                        score: number
                        descriptorLength: number
                        tag: string
                        role?: string
                        type?: string
                        text: string
                        label: string
                        placeholder?: string
                        href?: string
                        disabled: boolean
                    }>
                >((selected, candidate) => {
                    const existingIndex = selected.findIndex(
                        (existingCandidate) =>
                            existingCandidate.dedupeKey === candidate.dedupeKey
                    )

                    if (existingIndex === -1) {
                        selected.push(candidate)
                        return selected
                    }

                    const existingCandidate = selected[existingIndex]
                    const shouldReplace =
                        candidate.score > existingCandidate.score ||
                        (candidate.score === existingCandidate.score &&
                            candidate.descriptorLength >
                                existingCandidate.descriptorLength)

                    if (shouldReplace) {
                        selected.splice(existingIndex, 1, candidate)
                    }

                    return selected
                }, [])
                .sort((left, right) => {
                    if (right.score !== left.score) {
                        return right.score - left.score
                    }

                    if (left.rectTop !== right.rectTop) {
                        return left.rectTop - right.rectTop
                    }

                    return left.rectLeft - right.rectLeft
                })
                .slice(0, maxElements)
                .sort((left, right) => {
                    if (left.rectTop !== right.rectTop) {
                        return left.rectTop - right.rectTop
                    }

                    return left.rectLeft - right.rectLeft
                })
                .map((candidate, index) => {
                    const targetId = `t${index + 1}`
                    candidate.element.setAttribute(
                        'data-speedai-target-id',
                        targetId
                    )

                    return {
                        targetId,
                        tag: candidate.tag,
                        role: candidate.role,
                        type: candidate.type,
                        text: candidate.text,
                        label: candidate.label,
                        placeholder: candidate.placeholder,
                        href: candidate.href,
                        disabled: candidate.disabled
                    }
                })

            return {
                title: document.title || 'Untitled page',
                url: window.location.href,
                headings,
                regions,
                elements,
                mode: 'full' as const,
                generatedAt: new Date().toISOString()
            }
        },
        {
            interactiveSelector: INTERACTIVE_SELECTOR,
            regionSelector: REGION_SELECTOR,
            maxElements: MAX_ELEMENTS,
            maxHeadings: MAX_HEADINGS,
            maxRegions: MAX_REGIONS,
            maxRegionTextLength: MAX_REGION_TEXT_LENGTH,
            maxElementTextLength: MAX_ELEMENT_TEXT_LENGTH
        }
    )

    return rawSnapshot
}

async function captureSnapshot(
    page: Page,
    options: BrowserSnapshotOptions,
    fallbackMode: BrowserSnapshotMode
) {
    const previousSnapshot =
        lastRawSnapshot && lastRawSnapshot.url === page.url()
            ? lastRawSnapshot
            : null
    const rawSnapshot = await captureRawSnapshot(page)
    const snapshotMode = resolveSnapshotMode(options.snapshotMode, fallbackMode)
    const snapshot = applySnapshotMode(
        rawSnapshot,
        previousSnapshot,
        snapshotMode,
        options.focusText
    )

    lastRawSnapshot = rawSnapshot

    return {
        rawSnapshot,
        snapshot
    }
}

function beginAction(page: Page): ActionContext {
    const comparableSnapshot =
        lastRawSnapshot && lastRawSnapshot.url === page.url()
            ? lastRawSnapshot
            : null

    return {
        startedAt: Date.now(),
        beforeUrl: page.url(),
        beforeSnapshot: comparableSnapshot
    }
}

function buildReadiness(
    beforeUrl: string,
    beforeSnapshot: BrowserPageSnapshot | null,
    afterSnapshot: BrowserPageSnapshot
): BrowserAgentReadiness {
    const urlChanged = beforeUrl !== afterSnapshot.url
    const contentChanged =
        beforeSnapshot === null
            ? urlChanged
            : buildContentSignature(beforeSnapshot) !==
              buildContentSignature(afterSnapshot)

    return {
        state: urlChanged || contentChanged ? 'changed' : 'stable',
        detail: urlChanged
            ? 'URL alterada e pagina estabilizada.'
            : contentChanged
              ? 'Conteudo atualizado sem mudar a URL.'
              : 'Nenhuma mudanca relevante detectada apos a acao.',
        urlChanged,
        contentChanged
    }
}

async function finalizeActionResult(
    request: BrowserAgentRequest,
    page: Page,
    context: ActionContext,
    status: string,
    detail: string,
    settleDurationMs: number,
    fallbackSnapshotMode: BrowserSnapshotMode
): Promise<BrowserAgentActionResult> {
    const snapshotStartedAt = Date.now()
    const { rawSnapshot, snapshot } = await captureSnapshot(
        page,
        request,
        fallbackSnapshotMode
    )
    const snapshotDurationMs = Date.now() - snapshotStartedAt
    const actionDurationMs = Date.now() - context.startedAt

    return {
        action: request.action,
        status,
        detail,
        snapshot,
        readiness: buildReadiness(
            context.beforeUrl,
            context.beforeSnapshot,
            rawSnapshot
        ),
        metrics: {
            actionDurationMs,
            settleDurationMs,
            snapshotDurationMs,
            snapshotBytes: JSON.stringify(snapshot).length,
            snapshotMode: snapshot.mode,
            snapshotElementCount: snapshot.elements.length,
            snapshotHeadingCount: snapshot.headings.length,
            snapshotRegionCount: snapshot.regions.length
        }
    }
}

async function countVisibleInteractiveElements(page: Page) {
    return page.evaluate((interactiveSelector) => {
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

        return Array.from(
            document.querySelectorAll(interactiveSelector)
        ).filter(isElementVisible).length
    }, INTERACTIVE_SELECTOR)
}

async function waitForTextVisible(page: Page, text: string, timeoutMs: number) {
    const normalizedExpectedText = normalizeText(text)

    await page.waitForFunction(
        (expectedText) => {
            const bodyText = document.body?.innerText ?? ''
            return bodyText
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase()
                .includes(expectedText)
        },
        normalizedExpectedText,
        {
            timeout: timeoutMs
        }
    )
}

async function waitForElementMatch(
    page: Page,
    request: Extract<BrowserAgentRequest, { action: 'waitForElement' }>,
    timeoutMs: number
) {
    if (request.targetId) {
        const locator = await resolveTarget(page, request.targetId)
        await locator.waitFor({
            state: 'visible',
            timeout: timeoutMs
        })
        return
    }

    const normalizedText = normalizeText(request.text ?? '')

    await page.waitForFunction(
        ({ interactiveSelector, expectedText }) => {
            const normalizeWhitespace = (value: string) =>
                value.replace(/\s+/g, ' ').trim().toLowerCase()
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

            return Array.from(
                document.querySelectorAll(interactiveSelector)
            ).some((element) => {
                if (!isElementVisible(element)) {
                    return false
                }

                const parts = [
                    element.textContent ?? '',
                    element.getAttribute('aria-label') ?? '',
                    element.getAttribute('placeholder') ?? '',
                    element.getAttribute('title') ?? ''
                ]
                    .map(normalizeWhitespace)
                    .filter((value) => value.length > 0)

                return parts.some((value) => value.includes(expectedText))
            })
        },
        {
            interactiveSelector: INTERACTIVE_SELECTOR,
            expectedText: normalizedText
        },
        {
            timeout: timeoutMs
        }
    )
}

async function waitForNavigationChange(
    page: Page,
    previousUrl: string,
    timeoutMs: number,
    urlIncludes?: string
) {
    const urlMatcher = (currentUrl: URL) => {
        const nextUrl = currentUrl.toString()

        if (urlIncludes) {
            return nextUrl.includes(urlIncludes)
        }

        return nextUrl !== previousUrl
    }

    await page.waitForURL(urlMatcher, {
        timeout: timeoutMs
    })
    await settlePage(page, 0)
}

async function waitForUrlMatch(page: Page, url: string, timeoutMs: number) {
    const normalizedExpectedUrl = url.trim()

    await page.waitForURL(
        (currentUrl) =>
            currentUrl
                .toString()
                .toLowerCase()
                .includes(normalizedExpectedUrl.toLowerCase()),
        {
            timeout: timeoutMs
        }
    )
    await settlePage(page, 0)
}

async function waitForResultsChange(
    page: Page,
    timeoutMs: number,
    minimumChange: number
) {
    const initialCount = await countVisibleInteractiveElements(page)

    await page.waitForFunction(
        ({ interactiveSelector, previousCount, expectedDelta }) => {
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

            const nextCount = Array.from(
                document.querySelectorAll(interactiveSelector)
            ).filter(isElementVisible).length

            return Math.abs(nextCount - previousCount) >= expectedDelta
        },
        {
            interactiveSelector: INTERACTIVE_SELECTOR,
            previousCount: initialCount,
            expectedDelta: Math.max(1, minimumChange)
        },
        {
            timeout: timeoutMs
        }
    )
}

async function waitAfterTriggeredAction(
    page: Page,
    beforeUrl: string,
    timeoutMs: number,
    waitForUrl?: string,
    waitForText?: string
) {
    if (waitForUrl) {
        await waitForUrlMatch(page, waitForUrl, timeoutMs)
        return timeoutMs
    }

    if (waitForText) {
        await waitForTextVisible(page, waitForText, timeoutMs)
        await settlePage(page, 0)
        return timeoutMs
    }

    const startedAt = Date.now()
    await settlePage(page)

    if (page.url() === beforeUrl) {
        return Date.now() - startedAt
    }

    await settlePage(page, 0)
    return Date.now() - startedAt
}

async function handleNavigateAction(
    request: Extract<BrowserAgentRequest, { action: 'navigate' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const nextUrl = normalizeUrl(request.url)
    const settleStartedAt = Date.now()

    await page.goto(nextUrl, {
        waitUntil: 'domcontentloaded'
    })
    await settlePage(page)

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Pagina carregada',
        `${page.url()} pronta para leitura.`,
        Date.now() - settleStartedAt,
        'full'
    )
}

async function handleSnapshotAction(
    request: Extract<BrowserAgentRequest, { action: 'snapshot' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Pagina inspecionada',
        'Snapshot semantico atualizado.',
        0,
        'full'
    )
}

async function handleClickAction(
    request: Extract<BrowserAgentRequest, { action: 'click' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const locator = await resolveTarget(page, request.targetId)
    const settleStartedAt = Date.now()

    await locator.click()
    await settlePage(page)

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Clique executado',
        `Elemento ${request.targetId} acionado.`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handleTypeAction(
    request: Extract<BrowserAgentRequest, { action: 'type' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const locator = await resolveTarget(page, request.targetId)
    const settleStartedAt = Date.now()

    await fillLocator(page, locator, request.text)

    if (request.submit) {
        await locator.press('Enter').catch(() => page.keyboard.press('Enter'))
    }

    await settlePage(page)

    return finalizeActionResult(
        request,
        page,
        actionContext,
        request.submit ? 'Campo preenchido e enviado' : 'Campo preenchido',
        `Texto aplicado no elemento ${request.targetId}.`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handlePressAction(
    request: Extract<BrowserAgentRequest, { action: 'press' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const settleStartedAt = Date.now()

    await page.keyboard.press(request.key)
    await settlePage(page)

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Tecla enviada',
        `Tecla ${request.key} pressionada na pagina.`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handleWaitAction(
    request: Extract<BrowserAgentRequest, { action: 'wait' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const timeoutMs = resolveTimeoutMs(request.timeoutMs)
    const settleStartedAt = Date.now()

    await page.waitForTimeout(timeoutMs)
    await settlePage(page, 0)

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Pagina atualizada',
        `Aguardados ${timeoutMs} ms para estabilizacao.`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handleWaitForNavigationAction(
    request: Extract<BrowserAgentRequest, { action: 'waitForNavigation' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const timeoutMs = resolveTimeoutMs(request.timeoutMs)
    const settleStartedAt = Date.now()

    await waitForNavigationChange(
        page,
        actionContext.beforeUrl,
        timeoutMs,
        request.urlIncludes
    ).catch(() => {
        throw new Error(
            request.urlIncludes
                ? `A navegacao nao chegou a uma URL contendo "${request.urlIncludes}" dentro de ${timeoutMs} ms.`
                : `A pagina nao navegou para uma nova URL dentro de ${timeoutMs} ms.`
        )
    })

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Navegacao concluida',
        request.urlIncludes
            ? `URL final contem "${request.urlIncludes}".`
            : 'A URL mudou e a pagina estabilizou.',
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handleWaitForUrlAction(
    request: Extract<BrowserAgentRequest, { action: 'waitForUrl' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const timeoutMs = resolveTimeoutMs(request.timeoutMs)
    const settleStartedAt = Date.now()

    await waitForUrlMatch(page, request.url, timeoutMs).catch(() => {
        throw new Error(
            `A URL esperada "${request.url}" nao apareceu dentro de ${timeoutMs} ms.`
        )
    })

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'URL confirmada',
        `A URL atual corresponde ao esperado: ${page.url()}.`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handleWaitForTextAction(
    request: Extract<BrowserAgentRequest, { action: 'waitForText' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const timeoutMs = resolveTimeoutMs(request.timeoutMs)
    const settleStartedAt = Date.now()

    await waitForTextVisible(page, request.text, timeoutMs).catch(() => {
        throw new Error(
            `O texto "${request.text}" nao apareceu dentro de ${timeoutMs} ms.`
        )
    })
    await settlePage(page, 0)

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Texto localizado',
        `O texto "${request.text}" ficou visivel na pagina.`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handleWaitForElementAction(
    request: Extract<BrowserAgentRequest, { action: 'waitForElement' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const timeoutMs = resolveTimeoutMs(request.timeoutMs)
    const settleStartedAt = Date.now()

    await waitForElementMatch(page, request, timeoutMs).catch(() => {
        throw new Error(
            request.targetId
                ? `O elemento ${request.targetId} nao ficou disponivel dentro de ${timeoutMs} ms.`
                : `Nenhum elemento com "${request.text ?? ''}" ficou visivel dentro de ${timeoutMs} ms.`
        )
    })
    await settlePage(page, 0)

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Elemento disponivel',
        request.targetId
            ? `O elemento ${request.targetId} esta pronto para interacao.`
            : `Um elemento com "${request.text ?? ''}" ficou visivel.`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handleWaitForResultsChangeAction(
    request: Extract<BrowserAgentRequest, { action: 'waitForResultsChange' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const timeoutMs = resolveTimeoutMs(request.timeoutMs)
    const minimumChange = Math.max(1, clampNumber(request.minimumChange, 1, 24))
    const settleStartedAt = Date.now()

    await waitForResultsChange(page, timeoutMs, minimumChange).catch(() => {
        throw new Error(
            `Os resultados visiveis nao mudaram ao menos ${minimumChange} item(ns) dentro de ${timeoutMs} ms.`
        )
    })
    await settlePage(page, 0)

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Resultados atualizados',
        `Mudanca detectada no conjunto de resultados visiveis.`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handleScrollAction(
    request: Extract<BrowserAgentRequest, { action: 'scroll' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const amount = clampNumber(request.amount, 480, 1600)
    const deltaY = request.direction === 'down' ? amount : amount * -1
    const settleStartedAt = Date.now()

    await page.mouse.wheel(0, deltaY)
    await page.waitForTimeout(350)

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Pagina rolada',
        `Rolagem aplicada para ${request.direction} (${amount}px).`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handleClickAndWaitAction(
    request: Extract<BrowserAgentRequest, { action: 'clickAndWait' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const locator = await resolveTarget(page, request.targetId)
    const timeoutMs = resolveTimeoutMs(request.timeoutMs)
    const settleStartedAt = Date.now()

    await locator.click()
    await waitAfterTriggeredAction(
        page,
        actionContext.beforeUrl,
        timeoutMs,
        request.waitForUrl,
        request.waitForText
    )

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Clique concluido com espera',
        request.waitForUrl
            ? `Clique executado e URL esperada "${request.waitForUrl}" confirmada.`
            : request.waitForText
              ? `Clique executado e texto "${request.waitForText}" confirmado.`
              : `Elemento ${request.targetId} acionado e pagina estabilizada.`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
}

async function handleTypeAndSubmitAction(
    request: Extract<BrowserAgentRequest, { action: 'typeAndSubmit' }>
): Promise<BrowserAgentActionResult> {
    const page = await ensurePage()
    const actionContext = beginAction(page)
    const locator = await resolveTarget(page, request.targetId)
    const timeoutMs = resolveTimeoutMs(request.timeoutMs)
    const settleStartedAt = Date.now()

    await fillLocator(page, locator, request.text)
    await locator.press('Enter').catch(() => page.keyboard.press('Enter'))
    await waitAfterTriggeredAction(
        page,
        actionContext.beforeUrl,
        timeoutMs,
        request.waitForUrl,
        request.waitForText
    )

    return finalizeActionResult(
        request,
        page,
        actionContext,
        'Envio concluido com espera',
        request.waitForUrl
            ? `Formulario enviado e URL esperada "${request.waitForUrl}" confirmada.`
            : request.waitForText
              ? `Formulario enviado e texto "${request.waitForText}" confirmado.`
              : `Texto enviado no elemento ${request.targetId}.`,
        Date.now() - settleStartedAt,
        DEFAULT_POST_ACTION_SNAPSHOT_MODE
    )
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
        case 'waitForNavigation':
            return handleWaitForNavigationAction(request)
        case 'waitForUrl':
            return handleWaitForUrlAction(request)
        case 'waitForText':
            return handleWaitForTextAction(request)
        case 'waitForElement':
            return handleWaitForElementAction(request)
        case 'waitForResultsChange':
            return handleWaitForResultsChangeAction(request)
        case 'scroll':
            return handleScrollAction(request)
        case 'clickAndWait':
            return handleClickAndWaitAction(request)
        case 'typeAndSubmit':
            return handleTypeAndSubmitAction(request)
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
    lastRawSnapshot = null
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
