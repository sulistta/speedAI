import AgentShell from '@/features/agent/components/agent-shell'

export function HomePage() {
    return <AgentShell />
}

// Necessary for react router to lazy load.
export const Component = HomePage
