// src/lib/flags.ts
// Minimal feature flags helper.
// Defaults:
// - Claude Sonnet 4: enabled for all clients by default
// - GPT-5 Agent Mode: enabled for all clients by default

export const FLAGS = {
  CLAUDE_SONNET_4_ENABLED: (process.env.NEXT_PUBLIC_CLAUDE_SONNET_4_ENABLED ?? 'true') !== 'false',
  GPT5_AGENT_MODE_ENABLED: (process.env.NEXT_PUBLIC_GPT5_AGENT_MODE_ENABLED ?? 'true') !== 'false',
} as const;
