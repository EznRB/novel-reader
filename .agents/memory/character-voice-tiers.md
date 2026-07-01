---
name: Character voice tier system
description: 3-tier automatic voice assignment for pt-BR audiobook narration. Narrator voice is exclusive and never shared.
---

# Character Voice Tier System (pt-BR)

## The rule
Voice assignment uses a strict 3-tier hierarchy determined by character role. The narrator voice is NEVER assignable to any character.

## Tiers

### Narrador (never a character)
- Voice: `pt-BR-AntonioNeural` — exclusive, high quality, ideal for long reading

### Tier 1 — Personagens Principais (protagonist + antagonist)
- Each gets a **unique, permanent** voice from the main pool
- Voice never changes across chapters
- Male pool: `DonatoNeural, FranciscoNeural, JulioNeural, HumbertoNeural`
- Female pool: `FranciscaNeural, BrendaNeural, ElzaNeural, ManuelaNeural`

### Tier 2 — Personagens Secundários (supporting)
- All share one voice per gender
- Male: `pt-BR-FabioNeural`
- Female: `pt-BR-GiovannaNeural`

### Tier 3 — Figurantes (minor / unknown)
- Same shared voices as secondary tier (no unique voices wasted)

## Why
Prevents wasting unique voices on characters who appear once. Guarantees consistency for characters who matter to the story. Aligns with user expectation of "automatic, no configuration needed".

## How to apply
In `assign-voices` endpoint: iterate characters ordered by `firstAppearanceChapter`, check `role` field:
- `protagonist` or `antagonist` → pick next unused voice from MAIN pool
- anything else → use DEFAULT_MALE/DEFAULT_FEMALE

AI extraction prompt must be conservative: max 1-2 protagonists, max 1-3 antagonists, everyone else = supporting/minor.
