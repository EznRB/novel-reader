---
name: AudioPlayer ref-based architecture
description: Why AudioPlayer must use a stable Audio element (empty-deps useEffect) and refs for all props to avoid stuck-loading bug.
---

## The bug
When `sentences` prop was recalculated as a new array reference on every render (even with same content), the dependency chain cascaded:

`sentences` changed → `playSentence` useCallback reran → `handleEnded` useCallback reran → `useEffect([handleEnded])` cleanup ran → **`shouldPlayRef.current = false` was set** → the in-flight `fetchAudio` completed but was discarded → status stayed "loading" forever.

## The fix (two parts)

1. **`reader.tsx`** — memoize sentences with `useMemo(() => splitSentences(...), [chapter?.content])` so the array reference only changes when content actually changes.

2. **`audio-player.tsx`** — ref-based architecture:
   - Create `new Audio()` in `useEffect([], [])` (empty deps) so it is NEVER recreated during playback.
   - Mirror all props into refs (`sentencesRef.current = sentences` inline every render) so stable callbacks always read the latest values without being dependency-array dependencies.
   - Use `playSentenceRef` (updated via `useEffect`) so the `onEnded` handler in the stable Audio element can always call the latest `playSentence` without recreating the listener.

**Why:** Any `useEffect` that depends on a function that depends on frequently-changing props will re-run during async operations, resetting shared mutable refs and silently aborting in-flight work.

**How to apply:** Whenever an effect must be created once but needs to call callbacks that depend on props, use a ref pattern: store the callback in a ref, update the ref in a cheap effect, and call `ref.current()` inside the stable listener.
