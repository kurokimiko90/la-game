// 頂部導覽列：所有街區依路線排一列。目前的街區展開成各個區域（點了直接跳過去），
// 其他街區只顯示名稱（未解鎖顯示鎖頭）。目前看到的範圍在小地圖（TownMinimap）。
// 街區多了放不下，所以整列可以橫向捲動，目前的街區保持完整寬度並自動捲到可見處。
import { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { rectCenter, zoneKey, type Town } from '@/lib/town';
import type { Point } from '@/lib/types';

interface TownStripProps {
  town: Town;
  activeSceneId: string;
  lockedSceneIds: ReadonlySet<string>;
  hintZoneKey: string | null;
  onJumpTo: (p: Point) => void;
  onDistrict: (sceneId: string) => void;
}

export function TownStrip({ town, activeSceneId, lockedSceneIds, hintZoneKey, onJumpTo, onDistrict }: TownStripProps) {
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeSceneId]);

  return (
    <div data-ui="overlay" className="absolute left-3 right-16 top-3 z-40 max-w-2xl" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex h-8 overflow-x-auto overflow-y-hidden rounded-full bg-white/85 text-[11px] font-medium shadow ring-1 ring-black/5 [scrollbar-width:none]">
        {town.districts.map((d) => {
          if (d.scene.id !== activeSceneId) {
            const locked = lockedSceneIds.has(d.scene.id);
            return (
              <button key={d.scene.id} type="button" onClick={() => onDistrict(d.scene.id)}
                className={`flex shrink-0 items-center justify-center gap-1 whitespace-nowrap border-l border-black/10 px-2 first:border-l-0 hover:bg-brand-soft ${locked ? 'text-muted/70' : 'text-muted'}`}>
                {locked && <Lock size={10} aria-hidden />}
                <span>{d.scene.name}</span>
              </button>
            );
          }
          return (
            <div key={d.scene.id} ref={activeRef} className="flex shrink-0 border-l border-black/10 bg-brand-soft/60 first:border-l-0">
              {d.scene.zones.map((z) => {
                const key = zoneKey(d.scene.id, z.id);
                return (
                  <button key={z.id} type="button" onClick={() => onJumpTo(rectCenter(z))}
                    className={`whitespace-nowrap px-2 transition-colors ${key === hintZoneKey ? 'bg-accent/60' : 'hover:bg-brand-soft'}`}>
                    {z.name}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
