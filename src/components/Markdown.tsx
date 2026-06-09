import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export const Markdown = memo(function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`lesson-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}>
        {children}
      </ReactMarkdown>
    </div>
  )
})
