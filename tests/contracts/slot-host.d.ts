import '@deepseek-ai/dsh-client-ui-slots'

// A minimal renderer-host contract for the upstream type samples. Harness's
// ui-session supplies this merge in its full build; this project has no such UI.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SessionStandardProps {
    sessionId: string
  }
}
