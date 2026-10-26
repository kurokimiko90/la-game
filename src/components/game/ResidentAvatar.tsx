// 居民頭像：參數化的簡單 SVG（膚色、髮色、衣服、帽子、眼鏡）。
// talking = 正在念單字（嘴巴開合、頭微動）；happy = 委託完成（跳一下）。
import type { Headwear, ResidentLook } from '@/lib/residents';

interface ResidentAvatarProps {
  look: ResidentLook;
  talking?: boolean;
  happy?: boolean;
  className?: string;
}

function Hat({ kind, hair }: { kind: Headwear; hair: string }) {
  switch (kind) {
    case 'cap':
      return <g><path d="M28 30 Q50 10 72 30 Z" fill="#1565c0" /><rect x="60" y="27" width="22" height="5" rx="2.5" fill="#0d47a1" /></g>;
    case 'chef':
      return <g><rect x="32" y="20" width="36" height="12" fill="#fafafa" stroke="#cfd8dc" /><circle cx="38" cy="16" r="9" fill="#fafafa" /><circle cx="50" cy="12" r="10" fill="#fafafa" /><circle cx="62" cy="16" r="9" fill="#fafafa" /></g>;
    case 'nurse':
      return <g><path d="M32 28 L36 18 H64 L68 28 Z" fill="#fafafa" stroke="#cfd8dc" /><rect x="47.5" y="19" width="5" height="8" fill="#e53935" /><rect x="46" y="20.5" width="8" height="5" fill="#e53935" /></g>;
    case 'helmet':
      return <g><path d="M26 32 Q50 2 74 32 Z" fill="#fdd835" /><rect x="22" y="30" width="56" height="5" rx="2.5" fill="#f9a825" /></g>;
    case 'beret':
      return <g><ellipse cx="48" cy="22" rx="22" ry="9" fill="#5d4037" /><circle cx="50" cy="13" r="2.5" fill="#5d4037" /></g>;
    case 'bun':
      return <circle cx="50" cy="12" r="9" fill={hair} />;
    case 'pilot':
      return <g><path d="M28 28 Q50 12 72 28 V32 H28 Z" fill="#263238" /><rect x="26" y="30" width="48" height="5" rx="2" fill="#37474f" /><circle cx="50" cy="24" r="3" fill="#ffca28" /></g>;
    case 'straw':
      return <g><ellipse cx="50" cy="28" rx="30" ry="6" fill="#e6c36a" /><path d="M34 28 Q50 8 66 28 Z" fill="#f0d58c" /><rect x="35" y="24" width="30" height="3" fill="#c62828" /></g>;
    default:
      return null;
  }
}

export function ResidentAvatar({ look, talking = false, happy = false, className }: ResidentAvatarProps) {
  const state = talking ? 'resident--talking' : happy ? 'resident--happy' : '';
  return (
    <svg viewBox="0 0 100 100" className={`${state} ${className ?? ''}`} aria-hidden>
      <circle cx="50" cy="50" r="50" fill="#fff8e1" />
      <path d="M18 100 Q20 72 50 70 Q80 72 82 100 Z" fill={look.top} />
      <g className="resident-head">
        <rect x="44" y="60" width="12" height="12" fill={look.skin} />
        <path d="M28 40 Q28 20 50 20 Q72 20 72 40 L72 44 Q72 30 50 30 Q28 30 28 44 Z" fill={look.hair} />
        <circle cx="50" cy="44" r="21" fill={look.skin} />
        <path d="M29 40 Q32 24 50 24 Q68 24 71 40 Q62 32 50 33 Q38 32 29 40 Z" fill={look.hair} />
        <circle cx="42" cy="45" r="2.6" fill="#263238" />
        <circle cx="58" cy="45" r="2.6" fill="#263238" />
        <circle cx="37" cy="53" r="3.5" fill="#ff8a80" opacity="0.45" />
        <circle cx="63" cy="53" r="3.5" fill="#ff8a80" opacity="0.45" />
        {look.glasses && (
          <g fill="none" stroke="#37474f" strokeWidth="1.8">
            <circle cx="42" cy="45" r="6" /><circle cx="58" cy="45" r="6" /><path d="M48 45 H52" />
          </g>
        )}
        <path className="resident-mouth-closed" d="M44 55 Q50 60 56 55" fill="none" stroke="#6d4c41" strokeWidth="2.2" strokeLinecap="round" />
        <ellipse className="resident-mouth-open" cx="50" cy="57" rx="4.5" ry="3.5" fill="#6d4c41" />
        <Hat kind={look.headwear} hair={look.hair} />
      </g>
    </svg>
  );
}
