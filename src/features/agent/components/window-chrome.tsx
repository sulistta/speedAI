import type { MouseEvent } from 'react'
import { Minus, X } from 'lucide-react'

import {
    closeCurrentWindow,
    minimizeCurrentWindow,
    startCurrentWindowDrag
} from '@/features/agent/services/window-controls'

export default function WindowChrome() {
    function handleDragMouseDown(event: MouseEvent<HTMLElement>) {
        if (event.button !== 0) {
            return
        }

        void startCurrentWindowDrag()
    }

    function stopWindowControlPropagation(
        event: MouseEvent<HTMLButtonElement>
    ) {
        event.stopPropagation()
    }

    return (
        <header className="flex shrink-0 items-center gap-3 rounded-[1.6rem] border border-[var(--surface-stroke)] bg-[var(--window-chrome-surface)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center gap-2">
                <button
                    aria-label="Fechar janela"
                    className="group flex h-4 w-4 items-center justify-center rounded-full bg-[#ff5f57] text-black/55 transition hover:brightness-105"
                    data-window-control="true"
                    onClick={() => {
                        void closeCurrentWindow()
                    }}
                    onMouseDown={stopWindowControlPropagation}
                    type="button"
                >
                    <X className="h-2.5 w-2.5 opacity-0 transition group-hover:opacity-100" />
                </button>

                <button
                    aria-label="Minimizar janela"
                    className="group flex h-4 w-4 items-center justify-center rounded-full bg-[#ffbd2e] text-black/55 transition hover:brightness-105"
                    data-window-control="true"
                    onClick={() => {
                        void minimizeCurrentWindow()
                    }}
                    onMouseDown={stopWindowControlPropagation}
                    type="button"
                >
                    <Minus className="h-2.5 w-2.5 opacity-0 transition group-hover:opacity-100" />
                </button>
            </div>

            <div
                className="ml-1 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-full border border-[var(--surface-stroke)] bg-[var(--input-surface)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--text-tertiary)]"
                onMouseDown={handleDragMouseDown}
            >
                <span className="truncate">SpeedAI Desktop Agent</span>
                <span className="hidden sm:block">Drag Window</span>
            </div>
        </header>
    )
}
