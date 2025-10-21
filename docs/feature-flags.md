# Feature Flags

## Claude Sonnet 4

- Status: Enabled for all clients by default
- Env var: `NEXT_PUBLIC_CLAUDE_SONNET_4_ENABLED` (default: `true`)
- Code: `src/lib/flags.ts` exposes `FLAGS.CLAUDE_SONNET_4_ENABLED`

Usage example in code:

```ts
import { FLAGS } from '@/lib/flags';

if (FLAGS.CLAUDE_SONNET_4_ENABLED) {
  // Claude Sonnet 4 specific behavior
}
```
