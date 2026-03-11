import { z } from 'zod'
import { createEnv } from '@/lib/utils'

const EnvSchema = z.object({
    // Add your environment variables here
})

const env = createEnv(EnvSchema) as z.TypeOf<typeof EnvSchema>
export default env
