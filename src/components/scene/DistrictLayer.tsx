// 小鎮裡的一個街區：物件 + 提示區域 + 記憶挑戰的暗幕 + 未解鎖的霧（背景由 WorldBackground 統一畫）。
// memo：平移時只有 idle 會變，其他街區不必重畫；idle（在畫面外）時暫停動畫。
import { memo, useMemo } from 'react';
import { Lock } from 'lucide-react';
import { SceneItemNode } from './SceneItemNode';
import { districtBounds, drawList, rectCenter, zoneKey, type District } from '@/lib/town';
import { restingOnOthers } from '@/lib/shadows';

interface DistrictLayerProps {
  district: District;
  idle: boolean;
  locked: boolean;
  /** 解鎖條件的前一個街區名稱 */
  unlockHint: string | null;
  /** 目前關卡的狀態只套在目前的街區 */
  found: ReadonlySet<string>;
  hideUnfound: boolean;
  flashId: string | null;
  hintZoneKey: string | null;
}

function DistrictLayerImpl({ district, idle, locked, unlockHint, found, hideUnfound, flashId, hintZoneKey }: DistrictLayerProps) {
  const { scene } = district;
  const hintZone = scene.zones.find((z) => zoneKey(scene.id, z.id) === hintZoneKey);
  const center = rectCenter(districtBounds(district));
  const entries = useMemo(() => drawList(scene), [scene]);
  // 掛在牆上、在空中、疊在別的物件上的東西不畫接地影（影子會飄在半空）
  const stacked = useMemo(() => restingOnOthers(entries.map(({ item, copy }) => ({ ...(copy ?? item), key: copy?.id ?? item.id }))), [entries]);
  return (
    <g className={idle ? 'district district--idle' : 'district'} data-scene-id={scene.id}>
      {hideUnfound && scene.zones.map((z) => (
        <rect key={z.id} x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0} fill="#263238" opacity={0.28} pointerEvents="none" />
      ))}
      {hintZone && (
        <rect x={hintZone.x0} y={hintZone.y0} width={hintZone.x1 - hintZone.x0} height={hintZone.y1 - hintZone.y0} fill="#ffb300" className="zone-hint" pointerEvents="none" />
      )}
      <g pointerEvents={locked ? 'none' : undefined}>
        {entries.map(({ item, copy }) => {
          // 複本和原物件同一個狀態（找到、隱形、閃爍）
          const isFound = found.has(item.id);
          const hidden = hideUnfound && !isFound;
          const cls = ['scene-item', isFound && 'scene-item--found', hidden && 'scene-item--hidden', flashId === item.id && 'scene-item--flash']
            .filter(Boolean).join(' ');
          return <SceneItemNode key={copy?.id ?? item.id} item={item} copy={copy} className={cls} shadow={!hidden && !item.mount && !stacked.has(copy?.id ?? item.id)} />;
        })}
      </g>
      {locked && (
        <g pointerEvents="none">
          {scene.zones.map((z) => <rect key={z.id} x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0} fill="#f6f2e9" opacity={0.82} />)}
          <Lock x={center.x - 36} y={center.y - 120} width={72} height={72} color="#607d8b" strokeWidth={2} />
          <text x={center.x} y={center.y} textAnchor="middle" fontSize={40} fontWeight={700} fill="#263238">{scene.name}</text>
          {unlockHint && <text x={center.x} y={center.y + 52} textAnchor="middle" fontSize={26} fill="#607d8b">完成「{unlockHint}」的看圖找後解鎖</text>}
        </g>
      )}
    </g>
  );
}

export const DistrictLayer = memo(DistrictLayerImpl);
