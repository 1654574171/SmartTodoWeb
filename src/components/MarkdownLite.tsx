import type { ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

export default function MarkdownLite({ text }: { text: string }) {
  return (
    <div className="markdown">
      {text.split(/\r?\n/).map((raw, index) => {
        const line = raw.trim();
        if (!line) return <div className="markdown-gap" key={index} />;
        if (/^#{1,4}\s/.test(line)) {
          return <h4 key={index}>{inline(line.replace(/^#{1,4}\s/, ''))}</h4>;
        }
        if (/^[-*•]\s/.test(line) || /^\d+[.)]\s/.test(line)) {
          return (
            <div className="markdown-item" key={index}>
              <span className="markdown-dot" />
              <span>{inline(line.replace(/^([-*•]|\d+[.)])\s/, ''))}</span>
            </div>
          );
        }
        return <p key={index}>{inline(line)}</p>;
      })}
    </div>
  );
}
