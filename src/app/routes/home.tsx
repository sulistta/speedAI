import BuiltWith from '@/features/built-with'
import GithubStarButton from '@/features/github-star-button.tsx'

export function HomePage() {
    return (
        <div className="flex h-screen">
            <div className="m-auto text-center space-y-3">
                <BuiltWith />
                <h1 className="text-3xl items-center">Welcome to Tauri App!</h1>
                <GithubStarButton />
            </div>
        </div>
    )
}

// Necessary for react router to lazy load.
export const Component = HomePage
