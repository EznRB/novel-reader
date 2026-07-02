# Database

## ORM
Drizzle ORM – tipagem estática, migrações via `pnpm --filter @workspace/db run push`.

## Schemas resumidas
- **books** – id, title, author, description, total_chapters, total_words, tags, is_favorite, coverImage, timestamps.
- **chapters** – id, bookId (FK → books.id), chapterNumber, title, content, wordCount, timestamps.
- **reading_progress** – id, bookId (unique FK), currentChapter, characterPosition, lastReadAt.
- **chapter_summaries** – id, chapterId (unique FK), summary, quickSummary, charactersPresent, keyEvents, revelations, powerChanges, createdAt.
- **characters** – id, bookId, name, description, role, gender, firstAppearanceChapter, assignedVoice, createdAt.
- **book_knowledge** – id, bookId, entityType, name, description, firstAppearanceChapter, lastMentionedChapter, metadata, timestamps.
- **sessions** (implícito) – gerenciamento de cookies OIDC.

All foreign keys have `ON DELETE CASCADE`. Indexes are automatically created on PK/FK columns.
