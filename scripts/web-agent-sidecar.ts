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

interface BrowserVisualOptions {
    visualOverlayEnabled?: boolean
}

type BrowserAgentRequest =
    | ({
          id: string
          action: 'navigate'
          url: string
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'snapshot'
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'click'
          targetId: string
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'type'
          targetId: string
          text: string
          submit?: boolean
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'press'
          key: string
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'wait'
          timeoutMs?: number
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'waitForNavigation'
          timeoutMs?: number
          urlIncludes?: string
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'waitForUrl'
          url: string
          timeoutMs?: number
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'waitForText'
          text: string
          timeoutMs?: number
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'waitForElement'
          targetId?: string
          text?: string
          timeoutMs?: number
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'waitForResultsChange'
          timeoutMs?: number
          minimumChange?: number
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'scroll'
          direction: 'up' | 'down'
          amount?: number
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'clickAndWait'
          targetId: string
          waitForText?: string
          waitForUrl?: string
          timeoutMs?: number
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)
    | ({
          id: string
          action: 'typeAndSubmit'
          targetId: string
          text: string
          waitForText?: string
          waitForUrl?: string
          timeoutMs?: number
      } & BrowserSnapshotOptions &
          BrowserVisualOptions)

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
    highlightedTargetId?: string
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
    'input:not([type="hidden"])',
    'textarea',
    'select',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="searchbox"]',
    '[role="combobox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="slider"]',
    '[role="treeitem"]',
    '[contenteditable="true"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
    '[aria-controls]',
    '[aria-haspopup]'
].join(',')

const CONTENT_CONTAINER_SELECTOR = [
    'article',
    '[role="article"]',
    'li',
    '[role="listitem"]',
    'main',
    'section',
    'nav',
    'aside',
    '[class*="card"]',
    '[class*="result"]',
    '[class*="tile"]',
    '[class*="item"]',
    '[data-testid*="card"]',
    '[data-testid*="result"]',
    '[data-testid*="item"]',
    'ytd-video-renderer',
    'ytd-rich-item-renderer',
    'ytd-rich-grid-media',
    'ytd-compact-video-renderer',
    'yt-lockup-view-model'
].join(',')

const ACCESSIBLE_NAME_HINT_SELECTOR = [
    '.sr-only',
    '.visually-hidden',
    '.screen-reader-text',
    '[class*="sr-only"]',
    '[class*="visually-hidden"]'
].join(',')

const ACTIONABLE_ROLES = [
    'button',
    'link',
    'textbox',
    'searchbox',
    'combobox',
    'checkbox',
    'radio',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'switch',
    'tab',
    'slider',
    'treeitem'
]

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
const MAX_ELEMENTS = 72
const MAX_REGION_TEXT_LENGTH = 180
const MAX_ELEMENT_TEXT_LENGTH = 120
const FULL_SNAPSHOT_ELEMENT_LIMIT = 48
const INTERACTIVE_SNAPSHOT_ELEMENT_LIMIT = 28
const FOCUSED_SNAPSHOT_ELEMENT_LIMIT = 28
const FOCUSED_MATCH_ELEMENT_LIMIT = 18
const FOCUSED_FALLBACK_ELEMENT_LIMIT = 14
const DELTA_SNAPSHOT_ELEMENT_LIMIT = 18
const DELTA_FALLBACK_ELEMENT_LIMIT = 10
const TARGET_ID_ATTRIBUTE = 'data-speedai-target-id'
const OVERLAY_TARGET_ID_ATTRIBUTE = 'data-speedai-overlay-target-id'
const ACTIVE_TARGET_MARKER_ATTRIBUTE = 'data-speedai-active-target-marker'
const VISUAL_OVERLAY_ROOT_ID = 'speedai-visual-overlay-root'

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
        .locator(`[${TARGET_ID_ATTRIBUTE}="${targetId}"]`)
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

function getRequestedHighlightTargetId(request: BrowserAgentRequest) {
    switch (request.action) {
        case 'click':
        case 'type':
        case 'clickAndWait':
        case 'typeAndSubmit':
            return request.targetId
        case 'waitForElement':
            return request.targetId
        default:
            return undefined
    }
}

async function clearVisualOverlay(page: Page) {
    await page.evaluate(
        ({ overlayRootId }) => {
            type OverlayState = {
                mutationObserver?: MutationObserver
                resizeObserver?: ResizeObserver
                removeListeners: Array<() => void>
                frameId?: number
                root: HTMLDivElement
            }

            type OverlayHostWindow = Window & {
                __speedaiVisualOverlayState?: OverlayState
            }

            const hostWindow = window as OverlayHostWindow
            const state = hostWindow.__speedaiVisualOverlayState

            if (state?.frameId !== undefined) {
                window.cancelAnimationFrame(state.frameId)
            }

            state?.mutationObserver?.disconnect()
            state?.resizeObserver?.disconnect()
            state?.removeListeners.forEach((removeListener) => removeListener())

            delete hostWindow.__speedaiVisualOverlayState

            document.getElementById(overlayRootId)?.remove()
        },
        {
            overlayRootId: VISUAL_OVERLAY_ROOT_ID
        }
    )
}

async function clearActiveTargetMarker(page: Page) {
    await page.evaluate((activeTargetMarkerAttribute) => {
        document
            .querySelectorAll(`[${activeTargetMarkerAttribute}]`)
            .forEach((element) =>
                element.removeAttribute(activeTargetMarkerAttribute)
            )
    }, ACTIVE_TARGET_MARKER_ATTRIBUTE)
}

async function markActiveTargetMarker(locator: Locator) {
    await locator.evaluate((element, activeTargetMarkerAttribute) => {
        element.setAttribute(activeTargetMarkerAttribute, 'true')
    }, ACTIVE_TARGET_MARKER_ATTRIBUTE)
}

async function prepareActiveTargetMarker(
    page: Page,
    request: BrowserAgentRequest,
    locator?: Locator
) {
    await clearActiveTargetMarker(page)

    const targetId = getRequestedHighlightTargetId(request)

    if (targetId === undefined || locator === undefined) {
        return
    }

    await markActiveTargetMarker(locator)
}

async function renderSnapshotVisualOverlay(
    page: Page,
    snapshot: BrowserPageSnapshot,
    highlightedTargetId?: string
) {
    return await page.evaluate(
        ({
            overlayRootId,
            targetIdAttribute,
            overlayTargetIdAttribute,
            snapshotTargetIds,
            highlightedTargetId
        }) => {
            type OverlayItem = {
                targetId: string
                isActive: boolean
                box: HTMLDivElement
                badge: HTMLDivElement
            }

            type OverlayState = {
                mutationObserver?: MutationObserver
                resizeObserver?: ResizeObserver
                removeListeners: Array<() => void>
                frameId?: number
                root: HTMLDivElement
                items: OverlayItem[]
                scheduleUpdate: () => void
                refreshObservedTargets: () => void
            }

            type OverlayHostWindow = Window & {
                __speedaiVisualOverlayState?: OverlayState
            }

            const hostWindow = window as OverlayHostWindow
            const resolvedHighlightedTargetId = snapshotTargetIds.includes(
                highlightedTargetId ?? ''
            )
                ? highlightedTargetId
                : undefined
            const isOverlayNode = (element: Element | null) => {
                const overlayRoot = document.getElementById(overlayRootId)

                return (
                    element !== null &&
                    overlayRoot instanceof HTMLElement &&
                    overlayRoot.contains(element)
                )
            }

            function findTargetElement(targetId: string) {
                const targetElements = document.querySelectorAll(
                    `[${targetIdAttribute}="${targetId}"]`
                )

                for (const targetElement of targetElements) {
                    if (
                        targetElement instanceof HTMLElement &&
                        !isOverlayNode(targetElement)
                    ) {
                        return targetElement
                    }
                }

                return null
            }

            function buildOverlayRoot() {
                const root = document.createElement('div')
                root.id = overlayRootId
                root.setAttribute('aria-hidden', 'true')
                root.dataset.speedaiOverlayRoot = 'true'
                root.style.position = 'fixed'
                root.style.inset = '0'
                root.style.pointerEvents = 'none'
                root.style.zIndex = '2147483647'
                document.documentElement.append(root)

                return root
            }

            function buildOverlayItem(
                targetId: string,
                isActive: boolean
            ): OverlayItem {
                const box = document.createElement('div')
                box.setAttribute(overlayTargetIdAttribute, targetId)
                box.style.position = 'fixed'
                box.style.borderRadius = isActive ? '16px' : '14px'
                box.style.opacity = '0'
                box.style.transition =
                    'transform 120ms ease, width 120ms ease, height 120ms ease, opacity 120ms ease'

                const badge = document.createElement('div')
                badge.setAttribute(overlayTargetIdAttribute, targetId)
                badge.textContent = targetId
                badge.style.position = 'fixed'
                badge.style.padding = isActive ? '4px 9px' : '3px 8px'
                badge.style.borderRadius = '999px'
                badge.style.opacity = '0'
                badge.style.whiteSpace = 'nowrap'
                badge.style.font =
                    '600 12px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace'
                badge.style.letterSpacing = '0.04em'
                badge.style.transition =
                    'transform 120ms ease, opacity 120ms ease'

                if (isActive) {
                    box.style.border = '2px solid rgba(14, 165, 233, 0.98)'
                    box.style.background = 'rgba(14, 165, 233, 0.12)'
                    box.style.boxShadow =
                        '0 0 0 1px rgba(255,255,255,0.35), 0 18px 45px -24px rgba(14,165,233,0.95)'
                    badge.style.background = 'rgba(2, 6, 23, 0.94)'
                    badge.style.border = '1px solid rgba(125, 211, 252, 0.58)'
                    badge.style.boxShadow =
                        '0 14px 30px -18px rgba(2, 6, 23, 0.95)'
                    badge.style.color = 'white'
                } else {
                    box.style.border = '1px solid rgba(148, 163, 184, 0.72)'
                    box.style.background = 'rgba(148, 163, 184, 0.08)'
                    box.style.boxShadow =
                        '0 10px 28px -22px rgba(15, 23, 42, 0.72)'
                    badge.style.background = 'rgba(15, 23, 42, 0.78)'
                    badge.style.border = '1px solid rgba(148, 163, 184, 0.42)'
                    badge.style.boxShadow =
                        '0 10px 24px -18px rgba(15, 23, 42, 0.78)'
                    badge.style.color = 'rgba(226, 232, 240, 0.96)'
                }

                return {
                    targetId,
                    isActive,
                    box,
                    badge
                }
            }

            function hideOverlayItem(item: OverlayItem) {
                item.box.style.opacity = '0'
                item.box.style.width = '0px'
                item.box.style.height = '0px'
                item.box.style.transform = 'translate(-9999px, -9999px)'
                item.badge.style.opacity = '0'
                item.badge.style.transform = 'translate(-9999px, -9999px)'
            }

            function createState() {
                const root = buildOverlayRoot()
                const nextState: OverlayState = {
                    root,
                    items: [],
                    removeListeners: [],
                    scheduleUpdate: () => undefined,
                    refreshObservedTargets: () => undefined
                }

                nextState.refreshObservedTargets = () => {
                    if (typeof ResizeObserver !== 'function') {
                        return
                    }

                    if (nextState.resizeObserver === undefined) {
                        nextState.resizeObserver = new ResizeObserver(() => {
                            nextState.scheduleUpdate()
                        })
                    }

                    nextState.resizeObserver.disconnect()

                    for (const item of nextState.items) {
                        const targetElement = findTargetElement(item.targetId)

                        if (targetElement !== null) {
                            nextState.resizeObserver.observe(targetElement)
                        }
                    }
                }

                nextState.scheduleUpdate = () => {
                    if (nextState.frameId !== undefined) {
                        window.cancelAnimationFrame(nextState.frameId)
                    }

                    nextState.frameId = window.requestAnimationFrame(() => {
                        nextState.frameId = undefined

                        for (const item of nextState.items) {
                            const targetElement = findTargetElement(
                                item.targetId
                            )

                            if (
                                targetElement === null ||
                                isOverlayNode(targetElement)
                            ) {
                                hideOverlayItem(item)
                                continue
                            }

                            const rect = targetElement.getBoundingClientRect()

                            if (
                                rect.width < 1 ||
                                rect.height < 1 ||
                                rect.bottom < 0 ||
                                rect.top > window.innerHeight ||
                                rect.right < 0 ||
                                rect.left > window.innerWidth
                            ) {
                                hideOverlayItem(item)
                                continue
                            }

                            const outlineInset = item.isActive ? 4 : 2
                            const boxTop = Math.max(rect.top - outlineInset, 4)
                            const boxLeft = Math.max(
                                rect.left - outlineInset,
                                4
                            )
                            const boxWidth = Math.min(
                                rect.width + outlineInset * 2,
                                window.innerWidth - boxLeft - 4
                            )
                            const boxHeight = Math.min(
                                rect.height + outlineInset * 2,
                                window.innerHeight - boxTop - 4
                            )

                            if (
                                !Number.isFinite(boxWidth) ||
                                !Number.isFinite(boxHeight) ||
                                boxWidth < 1 ||
                                boxHeight < 1 ||
                                boxWidth > window.innerWidth ||
                                boxHeight > window.innerHeight
                            ) {
                                hideOverlayItem(item)
                                continue
                            }

                            item.box.style.opacity = '1'
                            item.box.style.transform = `translate(${boxLeft}px, ${boxTop}px)`
                            item.box.style.width = `${boxWidth}px`
                            item.box.style.height = `${boxHeight}px`

                            const badgeRect = item.badge.getBoundingClientRect()
                            const preferredBadgeTop =
                                boxTop - badgeRect.height - 8
                            const badgeTop =
                                preferredBadgeTop >= 4
                                    ? preferredBadgeTop
                                    : Math.min(
                                          boxTop + 6,
                                          window.innerHeight -
                                              badgeRect.height -
                                              4
                                      )
                            const badgeLeft = Math.min(
                                Math.max(boxLeft + 6, 8),
                                window.innerWidth - badgeRect.width - 8
                            )

                            item.badge.style.opacity = '1'
                            item.badge.style.transform = `translate(${badgeLeft}px, ${badgeTop}px)`
                        }
                    })
                }

                const subscribe = (
                    target: Window | Document | VisualViewport,
                    eventName: string
                ) => {
                    target.addEventListener(
                        eventName,
                        nextState.scheduleUpdate,
                        {
                            passive: true
                        }
                    )
                    nextState.removeListeners.push(() =>
                        target.removeEventListener(
                            eventName,
                            nextState.scheduleUpdate
                        )
                    )
                }

                subscribe(window, 'scroll')
                subscribe(window, 'resize')
                subscribe(document, 'visibilitychange')

                if (window.visualViewport) {
                    subscribe(window.visualViewport, 'resize')
                    subscribe(window.visualViewport, 'scroll')
                }

                nextState.mutationObserver = new MutationObserver(
                    (mutations) => {
                        const hasExternalMutation = mutations.some(
                            (mutation) =>
                                !nextState.root.contains(mutation.target)
                        )

                        if (hasExternalMutation) {
                            nextState.refreshObservedTargets()
                            nextState.scheduleUpdate()
                        }
                    }
                )
                nextState.mutationObserver.observe(
                    document.body ?? document.documentElement,
                    {
                        attributes: true,
                        childList: true,
                        subtree: true
                    }
                )

                return nextState
            }

            function reconcileOverlayItems(
                state: OverlayState,
                targets: Array<{
                    targetId: string
                    isActive: boolean
                }>
            ) {
                state.root.replaceChildren()
                state.items = targets.map((target) => {
                    const item = buildOverlayItem(
                        target.targetId,
                        target.isActive
                    )
                    state.root.append(item.box, item.badge)

                    return item
                })
            }

            let state = hostWindow.__speedaiVisualOverlayState

            if (
                state === undefined ||
                !state.root.isConnected ||
                !document.documentElement.contains(state.root)
            ) {
                if (state?.frameId !== undefined) {
                    window.cancelAnimationFrame(state.frameId)
                }

                state?.mutationObserver?.disconnect()
                state?.resizeObserver?.disconnect()
                state?.removeListeners.forEach((removeListener) =>
                    removeListener()
                )

                state = createState()
                hostWindow.__speedaiVisualOverlayState = state
            }

            reconcileOverlayItems(
                state,
                snapshotTargetIds.map((targetId) => ({
                    targetId,
                    isActive: targetId === resolvedHighlightedTargetId
                }))
            )
            state.refreshObservedTargets()
            state.scheduleUpdate()

            return new Promise<string | undefined>((resolve) => {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
                        resolve(resolvedHighlightedTargetId)
                    })
                })
            })
        },
        {
            overlayRootId: VISUAL_OVERLAY_ROOT_ID,
            targetIdAttribute: TARGET_ID_ATTRIBUTE,
            overlayTargetIdAttribute: OVERLAY_TARGET_ID_ATTRIBUTE,
            snapshotTargetIds: snapshot.elements.map(
                (element) => element.targetId
            ),
            highlightedTargetId
        }
    )
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
        .slice(0, FOCUSED_MATCH_ELEMENT_LIMIT)

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
            elements: snapshot.elements.slice(0, FOCUSED_FALLBACK_ELEMENT_LIMIT)
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
        .slice(0, DELTA_SNAPSHOT_ELEMENT_LIMIT)

    if (
        headings.length === 0 &&
        regions.length === 0 &&
        elements.length === 0
    ) {
        return {
            ...createSnapshotView(currentSnapshot, 'delta'),
            headings: [],
            regions: [],
            elements: currentSnapshot.elements.slice(
                0,
                DELTA_FALLBACK_ELEMENT_LIMIT
            )
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
                elements: rawSnapshot.elements.slice(
                    0,
                    FULL_SNAPSHOT_ELEMENT_LIMIT
                ),
                focusText
            }
        case 'interactive':
            return {
                ...createSnapshotView(rawSnapshot, mode),
                headings: [],
                regions: [],
                elements: rawSnapshot.elements.slice(
                    0,
                    INTERACTIVE_SNAPSHOT_ELEMENT_LIMIT
                ),
                focusText
            }
        case 'focused':
            return applyFocusToSnapshot(
                {
                    ...createSnapshotView(rawSnapshot, mode),
                    headings: rawSnapshot.headings.slice(0, 6),
                    regions: rawSnapshot.regions.slice(0, 6),
                    elements: rawSnapshot.elements.slice(
                        0,
                        FOCUSED_SNAPSHOT_ELEMENT_LIMIT
                    )
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

async function captureRawSnapshot(page: Page) {
    return await page.evaluate(
        ({
            interactiveSelector,
            regionSelector,
            contentContainerSelector,
            accessibleNameHintSelector,
            actionableRoles,
            targetIdAttribute,
            activeTargetMarkerAttribute,
            maxElements,
            maxHeadings,
            maxRegions,
            maxRegionTextLength,
            maxElementTextLength
        }) => {
            let activeTargetId: string | undefined

            type CandidateKind =
                | 'field'
                | 'button'
                | 'link'
                | 'toggle'
                | 'tab'
                | 'option'
                | 'menuitem'
                | 'container'
                | 'editable'
                | 'other'

            type CandidateSource =
                | 'native'
                | 'semantic'
                | 'implicit'
                | 'container'

            type SnapshotCandidate = {
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
                kind: CandidateKind
            }

            document
                .querySelectorAll(`[${targetIdAttribute}]`)
                .forEach((element) => {
                    element.removeAttribute(targetIdAttribute)
                })

            const normalizeWhitespace = (value: string) =>
                value.replace(/\s+/g, ' ').trim()
            const normalizeForCompare = (value: string) =>
                normalizeWhitespace(value).toLowerCase()
            const truncate = (value: string, length: number) => {
                const normalizedValue = normalizeWhitespace(value)

                if (normalizedValue.length <= length) {
                    return normalizedValue
                }

                return `${normalizedValue.slice(0, length - 1)}…`
            }
            const uniqueTextParts = (
                values: Array<string | null | undefined>
            ) => {
                const seen = new Set<string>()
                const parts: string[] = []

                for (const value of values) {
                    if (typeof value !== 'string') {
                        continue
                    }

                    const normalizedValue = normalizeWhitespace(value)

                    if (normalizedValue.length === 0) {
                        continue
                    }

                    const compareKey = normalizeForCompare(normalizedValue)

                    if (seen.has(compareKey)) {
                        continue
                    }

                    seen.add(compareKey)
                    parts.push(normalizedValue)
                }

                return parts
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
            const escapeSelectorValue = (value: string) => {
                if (
                    typeof window.CSS !== 'undefined' &&
                    typeof window.CSS.escape === 'function'
                ) {
                    return window.CSS.escape(value)
                }

                return value.replace(/["\\]/g, '\\$&')
            }
            const readIdReferenceText = (value: string | null, limit: number) =>
                truncate(
                    uniqueTextParts(
                        (value ?? '')
                            .split(/\s+/)
                            .map((id) => id.trim())
                            .filter((id) => id.length > 0)
                            .map((id) => {
                                const referencedElement =
                                    document.getElementById(id)

                                if (
                                    !(referencedElement instanceof HTMLElement)
                                ) {
                                    return ''
                                }

                                return (
                                    referencedElement.innerText ||
                                    referencedElement.textContent ||
                                    ''
                                )
                            })
                    ).join(' · '),
                    limit
                )
            const getAccessibleHintText = (element: Element, limit: number) => {
                if (!(element instanceof HTMLElement)) {
                    return ''
                }

                return truncate(
                    uniqueTextParts(
                        Array.from(
                            element.querySelectorAll(accessibleNameHintSelector)
                        )
                            .slice(0, 4)
                            .map(
                                (hintElement) =>
                                    hintElement.textContent ??
                                    (hintElement instanceof HTMLElement
                                        ? hintElement.innerText
                                        : '')
                            )
                    ).join(' · '),
                    limit
                )
            }
            const getNestedImageAltText = (element: Element, limit: number) => {
                if (!(element instanceof HTMLElement)) {
                    return ''
                }

                return truncate(
                    uniqueTextParts(
                        Array.from(
                            element.querySelectorAll<HTMLImageElement>(
                                'img[alt]'
                            )
                        )
                            .slice(0, 2)
                            .map((imageElement) => imageElement.alt)
                    ).join(' · '),
                    limit
                )
            }
            const getNestedSvgTitleText = (element: Element, limit: number) => {
                if (!(element instanceof HTMLElement)) {
                    return ''
                }

                return truncate(
                    uniqueTextParts(
                        Array.from(element.querySelectorAll('svg title'))
                            .slice(0, 2)
                            .map((titleElement) => titleElement.textContent)
                    ).join(' · '),
                    limit
                )
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

                if (element instanceof HTMLImageElement) {
                    return truncate(element.alt || '', limit)
                }

                if (!(element instanceof HTMLElement)) {
                    return ''
                }

                return truncate(
                    uniqueTextParts([
                        element.innerText || element.textContent || '',
                        getAccessibleHintText(element, limit),
                        getNestedImageAltText(element, limit),
                        getNestedSvgTitleText(element, limit)
                    ]).join(' · '),
                    limit
                )
            }
            const getFormControlLabel = (element: Element, limit: number) => {
                if (
                    !(
                        element instanceof HTMLInputElement ||
                        element instanceof HTMLTextAreaElement ||
                        element instanceof HTMLSelectElement
                    )
                ) {
                    return ''
                }

                const values = [
                    ...Array.from(element.labels ?? []).map(
                        (labelElement) =>
                            labelElement.innerText ||
                            labelElement.textContent ||
                            ''
                    )
                ]

                if (element.id) {
                    values.push(
                        ...Array.from(
                            document.querySelectorAll(
                                `label[for="${escapeSelectorValue(element.id)}"]`
                            )
                        ).map(
                            (labelElement) =>
                                labelElement.textContent ??
                                (labelElement instanceof HTMLElement
                                    ? labelElement.innerText
                                    : '')
                        )
                    )
                }

                return truncate(uniqueTextParts(values).join(' · '), limit)
            }
            const getElementLabel = (element: Element, limit: number) => {
                if (!(element instanceof HTMLElement)) {
                    return ''
                }

                const labelAncestor = element.closest('label')
                const elementId = element.getAttribute('id')

                return truncate(
                    uniqueTextParts([
                        element.getAttribute('aria-label'),
                        readIdReferenceText(
                            element.getAttribute('aria-labelledby'),
                            limit
                        ),
                        element.getAttribute('title'),
                        element instanceof HTMLImageElement ? element.alt : '',
                        getFormControlLabel(element, limit),
                        labelAncestor instanceof HTMLElement
                            ? labelAncestor.innerText ||
                              labelAncestor.textContent ||
                              ''
                            : '',
                        elementId
                            ? Array.from(
                                  document.querySelectorAll(
                                      `label[for="${escapeSelectorValue(elementId)}"]`
                                  )
                              )
                                  .map(
                                      (labelElement) =>
                                          labelElement.textContent ??
                                          (labelElement instanceof HTMLElement
                                              ? labelElement.innerText
                                              : '')
                                  )
                                  .join(' · ')
                            : '',
                        getAccessibleHintText(element, limit),
                        getNestedSvgTitleText(element, limit),
                        getNestedImageAltText(element, limit)
                    ]).join(' · '),
                    limit
                )
            }
            const getElementHref = (element: Element) =>
                element instanceof HTMLAnchorElement
                    ? element.href
                    : (() => {
                          const directHref = element.getAttribute('href') ?? ''

                          if (directHref.length > 0) {
                              return directHref
                          }

                          if (!(element instanceof HTMLElement)) {
                              return ''
                          }

                          const nestedAnchors = Array.from(
                              element.querySelectorAll<HTMLAnchorElement>(
                                  'a[href]'
                              )
                          ).filter((anchorElement) =>
                              isElementVisible(anchorElement)
                          )

                          return nestedAnchors.length === 1
                              ? nestedAnchors[0].href
                              : ''
                      })()
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
                Boolean(element.closest(contentContainerSelector))
            const hasInteractiveDatasetHint = (element: Element) => {
                if (!(element instanceof HTMLElement)) {
                    return false
                }

                return Object.entries(element.dataset).some(
                    ([key, value]) =>
                        /action|click|command|menu|item|tab|toggle|trigger|select/i.test(
                            key
                        ) || /action|menu|tab|toggle|select/i.test(value ?? '')
                )
            }
            const getCandidateSource = (
                element: Element,
                role: string
            ): CandidateSource => {
                const normalizedRole = role.toLowerCase()

                if (
                    element instanceof HTMLAnchorElement ||
                    element instanceof HTMLButtonElement ||
                    element instanceof HTMLInputElement ||
                    element instanceof HTMLTextAreaElement ||
                    element instanceof HTMLSelectElement ||
                    (element instanceof HTMLElement &&
                        element.tagName.toLowerCase() === 'summary')
                ) {
                    return 'native'
                }

                if (actionableRoles.includes(normalizedRole)) {
                    return 'semantic'
                }

                if (
                    element.getAttribute('contenteditable') === 'true' ||
                    element.hasAttribute('onclick') ||
                    element.hasAttribute('aria-controls') ||
                    element.hasAttribute('aria-haspopup')
                ) {
                    return 'implicit'
                }

                if (element instanceof HTMLElement) {
                    const tabIndex = element.tabIndex

                    if (tabIndex >= 0) {
                        return 'implicit'
                    }
                }

                return 'container'
            }
            const getCandidateKind = (
                element: Element,
                role: string
            ): CandidateKind => {
                const normalizedRole = role.toLowerCase()

                if (isInputLikeElement(element)) {
                    return 'field'
                }

                if (normalizedRole === 'tab') {
                    return 'tab'
                }

                if (
                    normalizedRole === 'checkbox' ||
                    normalizedRole === 'radio' ||
                    normalizedRole === 'switch'
                ) {
                    return 'toggle'
                }

                if (
                    normalizedRole === 'option' ||
                    element instanceof HTMLOptionElement
                ) {
                    return 'option'
                }

                if (
                    normalizedRole === 'menuitem' ||
                    normalizedRole === 'menuitemcheckbox' ||
                    normalizedRole === 'menuitemradio'
                ) {
                    return 'menuitem'
                }

                if (
                    element instanceof HTMLAnchorElement ||
                    normalizedRole === 'link'
                ) {
                    return 'link'
                }

                if (
                    element instanceof HTMLButtonElement ||
                    normalizedRole === 'button' ||
                    (element instanceof HTMLElement &&
                        element.tagName.toLowerCase() === 'summary')
                ) {
                    return 'button'
                }

                if (element.getAttribute('contenteditable') === 'true') {
                    return 'editable'
                }

                if (hasContentContainer(element)) {
                    return 'container'
                }

                return 'other'
            }
            const isLikelyActionable = (
                element: Element,
                role: string,
                descriptor: string,
                href: string
            ) => {
                const normalizedRole = role.toLowerCase()

                if (
                    element instanceof HTMLAnchorElement ||
                    element instanceof HTMLButtonElement ||
                    element instanceof HTMLInputElement ||
                    element instanceof HTMLTextAreaElement ||
                    element instanceof HTMLSelectElement ||
                    (element instanceof HTMLElement &&
                        element.tagName.toLowerCase() === 'summary')
                ) {
                    return true
                }

                if (actionableRoles.includes(normalizedRole)) {
                    return true
                }

                if (element.getAttribute('contenteditable') === 'true') {
                    return true
                }

                if (element.hasAttribute('onclick')) {
                    return (
                        descriptor.length > 0 ||
                        href.length > 0 ||
                        hasInteractiveDatasetHint(element)
                    )
                }

                if (element instanceof HTMLElement && element.tabIndex >= 0) {
                    return descriptor.length > 0 || href.length > 0
                }

                if (
                    element.hasAttribute('aria-controls') ||
                    element.hasAttribute('aria-haspopup')
                ) {
                    return descriptor.length > 0 || href.length > 0
                }

                if (!(element instanceof HTMLElement)) {
                    return false
                }

                const style = window.getComputedStyle(element)

                if (style.cursor === 'pointer') {
                    return descriptor.length > 0 || href.length > 0
                }

                if (hasInteractiveDatasetHint(element)) {
                    return descriptor.length > 0 || href.length > 0
                }

                return false
            }
            const buildDedupeKey = (
                kind: CandidateKind,
                element: Element,
                role: string,
                href: string,
                descriptor: string
            ) => {
                if (href.length > 0) {
                    return [
                        kind,
                        role,
                        element.tagName.toLowerCase(),
                        normalizeForCompare(href),
                        normalizeForCompare(descriptor)
                    ].join('|')
                }

                if (descriptor.length > 0) {
                    return [
                        kind,
                        role,
                        element.tagName.toLowerCase(),
                        normalizeForCompare(descriptor)
                    ].join('|')
                }

                const rect = element.getBoundingClientRect()

                return `position:${kind}:${rect.top}:${rect.left}:${element.tagName.toLowerCase()}`
            }
            const computeSelectionScore = (candidate: {
                element: Element
                rect: DOMRect
                kind: CandidateKind
                source: CandidateSource
                text: string
                label: string
                placeholder: string
                href: string
                role: string
                disabled: boolean
            }) => {
                const {
                    element,
                    rect,
                    kind,
                    source,
                    text,
                    label,
                    placeholder,
                    href,
                    role,
                    disabled
                } = candidate

                if (!(element instanceof HTMLElement)) {
                    return Number.NEGATIVE_INFINITY
                }

                const descriptorLength = Math.max(
                    text.length,
                    label.length,
                    placeholder.length
                )
                const area = rect.width * rect.height
                const isTinyControl = rect.width <= 28 || rect.height <= 20
                const normalizedRole = role.toLowerCase()
                const isContainer = kind === 'container'
                const inPriorityRegion = Boolean(
                    element.closest(
                        'main, nav, header, form, [role="dialog"], [role="menu"], [role="listbox"], [role="tablist"]'
                    )
                )

                let score = 0

                switch (kind) {
                    case 'field':
                        score += 620
                        break
                    case 'editable':
                        score += 560
                        break
                    case 'toggle':
                        score += 360
                        break
                    case 'tab':
                        score += 340
                        break
                    case 'option':
                    case 'menuitem':
                        score += 320
                        break
                    case 'button':
                        score += 300
                        break
                    case 'link':
                        score += 260
                        break
                    case 'container':
                        score += 210
                        break
                    case 'other':
                        score += 150
                        break
                }

                switch (source) {
                    case 'native':
                        score += 110
                        break
                    case 'semantic':
                        score += 95
                        break
                    case 'implicit':
                        score += 70
                        break
                    case 'container':
                        score += 40
                        break
                }

                if (href.length > 0) {
                    score += 110
                }

                if (hasContentContainer(element) && !isContainer) {
                    score += 90
                }

                if (descriptorLength > 0) {
                    score += Math.min(descriptorLength, 150)
                }

                if (text.length > 0) {
                    score += Math.min(120, 36 + text.length)
                }

                if (label.length > 0) {
                    score += Math.min(140, 64 + label.length)
                }

                if (placeholder.length > 0) {
                    score += 56
                }

                if (
                    label.length > 0 &&
                    text.length > 0 &&
                    normalizeForCompare(label) !== normalizeForCompare(text)
                ) {
                    score += 24
                }

                if (rect.top >= 0) {
                    score += Math.max(0, 240 - Math.min(rect.top, 420))
                } else {
                    score -= 80
                }

                if (rect.bottom <= window.innerHeight + 24) {
                    score += 26
                }

                if (area >= 600 && area <= 140_000) {
                    score += 40
                } else if (area > 220_000) {
                    score -= isContainer ? 110 : 30
                }

                if (inPriorityRegion) {
                    score += 42
                }

                if (isTinyControl) {
                    score -= descriptorLength > 0 || href.length > 0 ? 24 : 170
                }

                if (
                    isContainer &&
                    descriptorLength < 12 &&
                    href.length === 0 &&
                    normalizedRole.length === 0
                ) {
                    score -= 180
                }

                if (element.getAttribute('aria-hidden') === 'true') {
                    score -= 100
                }

                if (disabled) {
                    score -= 220
                }

                if (
                    element.getAttribute('aria-current') === 'page' ||
                    element.getAttribute('aria-selected') === 'true' ||
                    element.getAttribute('aria-pressed') === 'true'
                ) {
                    score += 24
                }

                if (hasInteractiveDatasetHint(element)) {
                    score += 22
                }

                return score
            }
            const shouldIncludeContainerCandidate = (element: Element) => {
                if (!(element instanceof HTMLElement)) {
                    return false
                }

                if (!isElementVisible(element)) {
                    return false
                }

                const role = element.getAttribute('role') ?? ''
                const descriptor = uniqueTextParts([
                    getElementLabel(element, 80),
                    getElementText(element, 80)
                ]).join(' · ')
                const href = getElementHref(element)
                const rect = element.getBoundingClientRect()

                if (rect.width * rect.height > 420_000) {
                    return false
                }

                return isLikelyActionable(element, role, descriptor, href)
            }
            const collectedElements = new Map<Element, true>()
            const rememberCandidate = (element: Element | null | undefined) => {
                if (!(element instanceof Element)) {
                    return
                }

                if (
                    element === document.documentElement ||
                    element === document.body
                ) {
                    return
                }

                if (!isElementVisible(element)) {
                    return
                }

                collectedElements.set(element, true)
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

            Array.from(document.querySelectorAll(interactiveSelector)).forEach(
                (element) => {
                    rememberCandidate(element)
                }
            )

            Array.from(
                document.querySelectorAll(contentContainerSelector)
            ).forEach((element) => {
                if (shouldIncludeContainerCandidate(element)) {
                    rememberCandidate(element)
                }
            })

            const filteredCandidates = Array.from(collectedElements.keys())
                .map((element) => {
                    const rect = element.getBoundingClientRect()
                    const text = getElementText(element, maxElementTextLength)
                    const label = getElementLabel(element, 80)
                    const href = getElementHref(element)
                    const placeholder = getElementPlaceholder(element)
                    const role = element.getAttribute('role') ?? undefined
                    const candidateRole = role ?? ''
                    const descriptor = uniqueTextParts([
                        label,
                        text,
                        placeholder
                    ]).join(' · ')
                    const kind = getCandidateKind(element, candidateRole)
                    const source = getCandidateSource(element, candidateRole)
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

                    if (
                        !isLikelyActionable(
                            element,
                            candidateRole,
                            descriptor,
                            href
                        )
                    ) {
                        return null
                    }

                    return {
                        element,
                        rectTop: rect.top,
                        rectLeft: rect.left,
                        dedupeKey: buildDedupeKey(
                            kind,
                            element,
                            candidateRole,
                            href,
                            descriptor
                        ),
                        score: computeSelectionScore({
                            element,
                            rect,
                            kind,
                            source,
                            text,
                            label,
                            placeholder,
                            href,
                            role: candidateRole,
                            disabled
                        }),
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
                        disabled,
                        kind
                    }
                })
                .filter(
                    (candidate) => candidate !== null
                ) as SnapshotCandidate[]

            const elements = filteredCandidates
                .reduce<SnapshotCandidate[]>((selected, candidate) => {
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
                .filter((candidate, index, candidates) => {
                    const descriptor = normalizeForCompare(
                        candidate.label ||
                            candidate.text ||
                            candidate.placeholder ||
                            ''
                    )

                    if (descriptor.length === 0) {
                        return true
                    }

                    const groupKey = `${candidate.kind}|${descriptor.slice(0, 18)}`
                    const groupLimit =
                        candidate.kind === 'container'
                            ? 3
                            : candidate.kind === 'tab'
                              ? 10
                              : 8
                    const previousMatches = candidates
                        .slice(0, index)
                        .filter((item) => {
                            const previousDescriptor = normalizeForCompare(
                                item.label ||
                                    item.text ||
                                    item.placeholder ||
                                    ''
                            )

                            return (
                                `${item.kind}|${previousDescriptor.slice(0, 18)}` ===
                                groupKey
                            )
                        })

                    return previousMatches.length < groupLimit
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
                    candidate.element.setAttribute(targetIdAttribute, targetId)

                    if (
                        candidate.element.hasAttribute(
                            activeTargetMarkerAttribute
                        )
                    ) {
                        activeTargetId = targetId
                    }

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

            document
                .querySelectorAll(`[${activeTargetMarkerAttribute}]`)
                .forEach((element) => {
                    element.removeAttribute(activeTargetMarkerAttribute)
                })

            return {
                rawSnapshot: {
                    title: document.title || 'Untitled page',
                    url: window.location.href,
                    headings,
                    regions,
                    elements,
                    mode: 'full' as const,
                    generatedAt: new Date().toISOString()
                },
                activeTargetId
            }
        },
        {
            interactiveSelector: INTERACTIVE_SELECTOR,
            regionSelector: REGION_SELECTOR,
            contentContainerSelector: CONTENT_CONTAINER_SELECTOR,
            accessibleNameHintSelector: ACCESSIBLE_NAME_HINT_SELECTOR,
            actionableRoles: ACTIONABLE_ROLES,
            targetIdAttribute: TARGET_ID_ATTRIBUTE,
            activeTargetMarkerAttribute: ACTIVE_TARGET_MARKER_ATTRIBUTE,
            maxElements: MAX_ELEMENTS,
            maxHeadings: MAX_HEADINGS,
            maxRegions: MAX_REGIONS,
            maxRegionTextLength: MAX_REGION_TEXT_LENGTH,
            maxElementTextLength: MAX_ELEMENT_TEXT_LENGTH
        }
    )
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
    const { rawSnapshot, activeTargetId } = await captureRawSnapshot(page)
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
        snapshot,
        activeTargetId
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
    const { rawSnapshot, snapshot, activeTargetId } = await captureSnapshot(
        page,
        request,
        fallbackSnapshotMode
    )
    const snapshotDurationMs = Date.now() - snapshotStartedAt
    const actionDurationMs = Date.now() - context.startedAt
    const highlightedTargetId =
        request.visualOverlayEnabled === true
            ? await renderSnapshotVisualOverlay(page, snapshot, activeTargetId)
            : undefined

    if (request.visualOverlayEnabled !== true) {
        await clearVisualOverlay(page)
    }

    return {
        action: request.action,
        status,
        detail,
        snapshot,
        highlightedTargetId,
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
            const uniqueTextParts = (
                values: Array<string | null | undefined>
            ) => {
                const seen = new Set<string>()
                const parts: string[] = []

                for (const value of values) {
                    if (typeof value !== 'string') {
                        continue
                    }

                    const normalizedValue = normalizeWhitespace(value)

                    if (
                        normalizedValue.length === 0 ||
                        seen.has(normalizedValue)
                    ) {
                        continue
                    }

                    seen.add(normalizedValue)
                    parts.push(normalizedValue)
                }

                return parts
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
            const readIdReferenceText = (value: string | null) =>
                uniqueTextParts(
                    (value ?? '')
                        .split(/\s+/)
                        .map((id) => id.trim())
                        .filter((id) => id.length > 0)
                        .map((id) => {
                            const referencedElement =
                                document.getElementById(id)

                            if (!(referencedElement instanceof HTMLElement)) {
                                return ''
                            }

                            return (
                                referencedElement.innerText ||
                                referencedElement.textContent ||
                                ''
                            )
                        })
                )

            return Array.from(
                document.querySelectorAll(interactiveSelector)
            ).some((element) => {
                if (!isElementVisible(element)) {
                    return false
                }

                const formControlLabel =
                    element instanceof HTMLInputElement ||
                    element instanceof HTMLTextAreaElement ||
                    element instanceof HTMLSelectElement
                        ? Array.from(element.labels ?? []).map(
                              (labelElement) =>
                                  labelElement.innerText ||
                                  labelElement.textContent ||
                                  ''
                          )
                        : []

                const parts = uniqueTextParts([
                    element.textContent ?? '',
                    element.getAttribute('aria-label') ?? '',
                    readIdReferenceText(
                        element.getAttribute('aria-labelledby')
                    ).join(' '),
                    element.getAttribute('placeholder') ?? '',
                    element.getAttribute('title') ?? '',
                    element instanceof HTMLImageElement ? element.alt : '',
                    ...formControlLabel
                ])

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
    await prepareActiveTargetMarker(page, request)
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
    await prepareActiveTargetMarker(page, request)
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
    const locator = await resolveTarget(page, request.targetId)
    await prepareActiveTargetMarker(page, request, locator)
    const actionContext = beginAction(page)
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
    const locator = await resolveTarget(page, request.targetId)
    await prepareActiveTargetMarker(page, request, locator)
    const actionContext = beginAction(page)
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
    await prepareActiveTargetMarker(page, request)
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
    await prepareActiveTargetMarker(page, request)
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
    await prepareActiveTargetMarker(page, request)
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
    await prepareActiveTargetMarker(page, request)
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
    await prepareActiveTargetMarker(page, request)
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
    await prepareActiveTargetMarker(page, request)
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

    if (request.targetId !== undefined) {
        const locator = await resolveTarget(page, request.targetId)
        await prepareActiveTargetMarker(page, request, locator)
    }

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
    await prepareActiveTargetMarker(page, request)
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
    await prepareActiveTargetMarker(page, request)
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
    const locator = await resolveTarget(page, request.targetId)
    await prepareActiveTargetMarker(page, request, locator)
    const actionContext = beginAction(page)
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
    const locator = await resolveTarget(page, request.targetId)
    await prepareActiveTargetMarker(page, request, locator)
    const actionContext = beginAction(page)
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
