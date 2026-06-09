// Lesson bodies are authored as raw markdown files (./<lessonId>.md) and
// eagerly imported here. Raw import = zero escaping headaches, hot-reloadable.
const bodies = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export function getLessonBody(id: string): string | undefined {
  return bodies[`./${id}.md`]
}

export const authoredIds = new Set(Object.keys(bodies).map((k) => k.replace('./', '').replace('.md', '')))
export const authoredCount = authoredIds.size
