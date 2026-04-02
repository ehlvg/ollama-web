# ollama-web Agent Notes

## Goal
Keep the UI/visuals stable, but make the client logic match the current `ollama` JavaScript/TypeScript library behavior (no legacy/Go-shaped API glue).

## High-level architecture
- UI: `src/components/*` (Tailwind + shadcn-style primitives under `src/components/ui/*`)
- Routing: `@tanstack/react-router` (`src/routes/*`)
- Server state: `@tanstack/react-query`
- Chat streaming/tool-events: implemented as an async event stream in `src/api.ts`
- Persistence:
  - chats + messages are stored in `localStorage` (`ollama_web_chats`)
  - settings are stored in `localStorage` (`ollama_web_settings`)

## Key contract: streaming events
The UI does not call Ollama directly. It consumes an async generator from:
- `sendMessage(...)` exported by `src/api.ts`

`sendMessage(...)` yields `ChatEventUnion`, where each yielded event has:
- `eventName` in: `chat | thinking | assistant_with_tools | tool_call | tool | tool_result | done | chat_created`
- Additional fields consumed by the UI:
  - `chat`: `content` (delta)
  - `thinking`: `thinking` (delta) + optional `thinkingTimeStart/End`
  - `assistant_with_tools`: `toolCalls` + optional thinking times
  - `tool_result`: `content` + `toolName`

If you change the event shapes, you must update:
- `src/hooks/useChats.ts` (event handling into React Query cache)
- `src/components/Message.tsx`, `src/components/MessageList.tsx` (rendering expectations)

## Ollama integration (current implementation)
All Ollama calls are centralized in `src/api.ts`.
Important:
- Frontend build must use the browser entrypoint: `ollama/browser`
  - Do not import `ollama` main entrypoint in the browser bundle.
- Streaming: `ollama.chat({ stream: true })`
- Tool calling:
  - currently tool functions are wired to UI tool-calls and executed server-side via:
    - `ollama.webSearch()` for `web_search`
    - `ollama.webFetch()` for `web_fetch`
  - the code keeps a local conversation transcript in `localStorage`, and loops:
    1. stream assistant output until `done_reason === "tool_calls"`
    2. execute tools
    3. append `tool` messages
    4. continue chat streaming

## Types
`src/gocodegen/gotypes.gen.ts` is generated from Go structs and should be treated as read-only.
- Imports from `@/gotypes` are expected across the UI.

## Model merging / featured order
`src/utils/mergeModels.ts` exports `FEATURED_MODELS` and `mergeModels()`.
Tests depend on the `FEATURED_MODELS` export:
- `src/utils/mergeModels.test.ts`

## Where to change what
- Add/adjust Ollama request params: `src/api.ts` (`sendMessage`, `getModels`, `getModelCapabilities`, `pullModel`)
- Adjust UI reaction to streaming: `src/hooks/useChats.ts`
- Adjust rendering: `src/components/Message.tsx`, `src/components/Thinking.tsx`, `src/components/StreamingMarkdownContent.tsx`

## Dev commands
- Build: `npm run build`
- Tests: `npm test`

