import type { MouseEvent } from 'react'
import { Minus, X } from 'lucide-react'
import {
    closeCurrentWindow,
    minimizeCurrentWindow,
    startCurrentWindowDrag
} from '@/features/agent/services/window-controls'

export default function WindowChrome({
    title = 'SpeedAI Desktop Agent'
}: {
    title?: string
}) {
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
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--surface-stroke)] bg-[var(--window-chrome-surface)] px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center gap-2">
                <button
                    aria-label="Fechar janela"
                    className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#ff5f57] text-black/55 transition hover:brightness-105"
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
                    className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#ffbd2e] text-black/55 transition hover:brightness-105"
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
                className="flex min-w-0 flex-1 cursor-grab items-center justify-center rounded-full border border-[var(--surface-stroke)] bg-[var(--chrome-pill)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)] active:cursor-grabbing"
                onMouseDown={handleDragMouseDown}
            >
                <span className="truncate">{title}</span>
            </div>
        </header>
    )
}
