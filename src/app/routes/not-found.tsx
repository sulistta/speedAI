import { Button } from '@/components/ui/button'
import {
    ErrorView,
    ErrorHeader,
    ErrorDescription,
    ErrorActions
} from '@/features/errors/error-base'
import { useNavigate } from 'react-router'

export default function NotFoundErrorPage() {
    const navigate = useNavigate()
    return (
        <ErrorView>
            <ErrorHeader>Page not found</ErrorHeader>
            <ErrorDescription>
                The requested page is not available.
            </ErrorDescription>
            <ErrorActions>
                <Button size="lg" onClick={() => navigate(-1)}>
                    Go back
                </Button>
            </ErrorActions>
        </ErrorView>
    )
}

// Necessary for react router to lazy load.
export const Component = NotFoundErrorPage
