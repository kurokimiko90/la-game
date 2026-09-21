import type { Lang, Words } from '@/lib/types';

interface WordTextProps {
  words: Words;
  lang: Lang;
  showReading?: boolean;
  className?: string;
}

// 日語有漢字時用 ruby 顯示假名讀音；純假名（例：ベンチ）不重複標注
export function WordText({ words, lang, showReading = true, className }: WordTextProps) {
  if (lang === 'en') return <span lang="en" className={className}>{words.en}</span>;
  const { text, reading } = words.ja;
  if (!showReading || reading === text) return <span lang="ja" className={className}>{text}</span>;
  return (
    <ruby lang="ja" className={className}>
      {text}
      <rt>{reading}</rt>
    </ruby>
  );
}
