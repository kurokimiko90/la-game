'use client';

// 首頁的整張小鎮：點過（聽過）的物品是彩色，沒點過的褪色 —— 一眼看出記憶宮殿蓋到哪裡。
// 每個街區上有一個標籤（名稱、點亮比例、星星），點了進入該街區。
import { memo, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { SceneItemNode } from '../scene/SceneItemNode';
import { WorldBackground } from '../scene/WorldBackground';
import { Stars } from '../game/StageMenu';
import { districtBounds, rectCenter, type District, type Town } from '@/lib/town';

export interface DistrictStatus {
  seen: number;
  total: number;
  stars: number;
  locked: boolean;
  unlockHint: string | null;
}

interface TownOverviewProps {
  town: Town;
  /** wordKey(sceneId, itemId) → 看過 */
  seenKeys: ReadonlySet<string>;
  status: ReadonlyMap<string, DistrictStatus>;
}

const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

function Ring({ ratio }: { ratio: number }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={RING_R} fill="none" stroke="#00000014" strokeWidth="4" />
      {ratio > 0 && (
        <circle cx="12" cy="12" r={RING_R} fill="none" stroke={ratio >= 1 ? '#ffb300' : '#00796b'} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${RING_C * ratio} ${RING_C}`} />
      )}
    </svg>
  );
}

// 地圖本體很重（幾百個物件），只在看過的物品改變時重畫
const TownArt = memo(function TownArt({ town, seenKeys, lockedIds, onOpen }: {
  town: Town; seenKeys: ReadonlySet<string>; lockedIds: ReadonlySet<string>; onOpen: (sceneId: string) => void;
}) {
  const districts = useMemo(() => [...town.districts].sort((a, b) => districtBounds(a).y0 - districtBounds(b).y0), [town]);
  return (
    <svg viewBox={`0 0 ${town.width} ${town.height}`} className="block h-auto w-full" role="img" aria-label="小鎮全景：彩色的是你已經認識的物品">
      <WorldBackground town={town} activeSections="" />
      {districts.map((d: District) => {
        const locked = lockedIds.has(d.scene.id);
        return (
          <g key={d.scene.id} className="district district--idle">
            {d.scene.items.map((item) => (
              <SceneItemNode key={item.id} item={item} className={seenKeys.has(`${d.scene.id}/${item.id}`) ? undefined : 'item-dim'} />
            ))}
            {locked && d.scene.zones.map((z) => (
              <rect key={z.id} x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0} fill="#f6f2e9" opacity={0.8} />
            ))}
            {!locked && d.scene.zones.map((z) => (
              <rect key={`hit-${z.id}`} x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0} fill="transparent"
                className="cursor-pointer" onClick={() => onOpen(d.scene.id)} />
            ))}
          </g>
        );
      })}
    </svg>
  );
});

export function TownOverview({ town, seenKeys, status }: TownOverviewProps) {
  const router = useRouter();
  const lockedIds = useMemo(() => new Set([...status].filter(([, s]) => s.locked).map(([id]) => id)), [status]);
  const onOpen = useMemo(() => (sceneId: string) => router.push(`/scene/${sceneId}`), [router]);

  return (
    <div className="town-overview relative overflow-x-auto rounded-3xl bg-[#cfe3b4] shadow-inner ring-1 ring-black/5">
      <div className="relative min-w-[760px]">
        <TownArt town={town} seenKeys={seenKeys} lockedIds={lockedIds} onOpen={onOpen} />
        {town.districts.map((d, i) => {
          const s = status.get(d.scene.id);
          if (!s) return null;
          const c = rectCenter(districtBounds(d));
          const ratio = s.total ? s.seen / s.total : 0;
          const pos = { left: `${(c.x / town.width) * 100}%`, top: `${(c.y / town.height) * 100}%` };
          const body = (
            <>
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink/80 text-[10px] font-bold text-white">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold leading-tight">{d.scene.name}</span>
                {s.locked ? (
                  <span className="block text-[10px] leading-tight text-muted">完成「{s.unlockHint}」看圖找</span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] leading-tight text-muted">
                    {s.seen}/{s.total} <Stars count={s.stars} size={10} />
                  </span>
                )}
              </span>
              {s.locked ? <Lock size={16} className="shrink-0 text-muted" /> : <Ring ratio={ratio} />}
            </>
          );
          return (
            <div key={d.scene.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={pos}>
              {s.locked ? (
                <div aria-disabled className="flex max-w-40 items-center gap-1.5 rounded-full bg-white/80 py-1 pl-1 pr-2 opacity-80 shadow ring-1 ring-black/5">{body}</div>
              ) : (
                <Link href={`/scene/${d.scene.id}`}
                  className={`flex max-w-44 items-center gap-1.5 rounded-full bg-white/95 py-1 pl-1 pr-1.5 shadow-md ring-2 transition hover:scale-105 hover:shadow-lg ${ratio >= 1 ? 'ring-accent' : 'ring-white hover:ring-brand'}`}>
                  {body}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
