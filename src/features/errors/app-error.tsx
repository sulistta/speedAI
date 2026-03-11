import { relaunch } from '@tauri-apps/plugin-process'
import { Button } from '@/components/ui/button'
import {
    ErrorView,
    ErrorHeader,
    ErrorDescription,
    ErrorActions
} from '@/features/errors/error-base'

export default function AppErrorPage() {
    return (
        <ErrorView>
            <ErrorHeader>Unexpected error</ErrorHeader>
            <ErrorDescription>
                The app ran into an unexpected issue and needs to restart.
            </ErrorDescription>
            <ErrorActions>
                <Button size="lg" onClick={relaunch}>
                    Restart app
                </Button>
            </ErrorActions>
        </ErrorView>
    )
}
