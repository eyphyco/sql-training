import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`md text-slate-200 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
