// 物件圖示。body 是建置時白名單清洗過的純幾何 SVG（scripts/lib/svg-sanitize.mjs），才能直接內嵌。
interface SvgArtProps {
  viewBox: number[];
  body: string;
  className?: string;
  title?: string;
}

export function SvgArt({ viewBox, body, className, title }: SvgArtProps) {
  return (
    <svg
      viewBox={viewBox.join(' ')}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
