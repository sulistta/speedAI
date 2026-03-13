import type {
    AgentExecutionMetrics,
    BrowserAgentActionResult
} from '@/features/agent/types'

export function createExecutionMetricsTracker() {
    let llmRoundTrips = 0
    let llmLatencyMs = 0
    let toolCalls = 0
    let toolLatencyMs = 0
    let settleLatencyMs = 0
    let snapshotLatencyMs = 0
    let snapshotBytes = 0

    return {
        recordLLMCall(durationMs: number) {
            llmRoundTrips += 1
            llmLatencyMs += durationMs
        },
        recordToolResult(result: BrowserAgentActionResult) {
            toolCalls += 1
            toolLatencyMs += result.metrics.actionDurationMs
            settleLatencyMs += result.metrics.settleDurationMs
            snapshotLatencyMs += result.metrics.snapshotDurationMs
            snapshotBytes += result.metrics.snapshotBytes
        },
        finalize(
            totalDurationMs: number,
            stepCount: number
        ): AgentExecutionMetrics {
            return {
                totalDurationMs,
                stepCount,
                llmRoundTrips,
                llmLatencyMs,
                toolCalls,
                toolLatencyMs,
                settleLatencyMs,
                snapshotLatencyMs,
                snapshotBytes
            }
        }
    }
}
