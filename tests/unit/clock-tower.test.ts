import { describe, expect, test } from 'vitest';
import { buildClockTower, tokyoHandAngles, WAKO_CLOCK } from '@/components/city3d/ginzaClockTower';

describe('和光鐘樓', () => {
  test('UTC 換成東京時間，跨日午夜的兩根指針都指向 12 點', () => {
    expect(tokyoHandAngles(new Date('2026-10-08T15:00:00Z'))).toEqual({ hour: 0, minute: 0 });
    expect(tokyoHandAngles(new Date('2026-10-09T03:00:00Z'))).toEqual({ hour: 0, minute: 0 });
  });

  test('時針包含分鐘、分針包含秒數，輸入時區表示不同也得到相同角度', () => {
    const angles = tokyoHandAngles(new Date('2026-10-09T06:30:30Z'));
    expect(angles.hour).toBeCloseTo((3.508333333333333 / 12) * Math.PI * 2);
    expect(angles.minute).toBeCloseTo((30.5 / 60) * Math.PI * 2);
    expect(tokyoHandAngles(new Date('2026-10-09T15:30:30+09:00'))).toEqual(angles);
  });

  test('四面鐘都以同一東京時間順時針更新，鐘樓底部在和光屋頂', () => {
    const tower = buildClockTower({ ...WAKO_CLOCK, base: 28 });
    expect(tower.group.position.toArray()).toEqual([WAKO_CLOCK.x, 28, WAKO_CLOCK.z]);
    const faces = tower.group.children.filter((obj) => obj.name.startsWith('clock-face-'));
    expect(faces).toHaveLength(4);
    tower.update(new Date('2026-10-09T06:00:00Z'));
    for (const face of faces) {
      expect(face.position.y).toBe(4.6);
      expect(face.getObjectByName('hour-hand')!.rotation.z).toBeCloseTo(-Math.PI / 2);
      expect(face.getObjectByName('minute-hand')!.rotation.z).toBeCloseTo(0);
    }
    tower.update(new Date('2026-10-09T09:30:00Z'));
    for (const face of faces) {
      expect(face.getObjectByName('hour-hand')!.rotation.z).toBeCloseTo(-(6.5 / 12) * Math.PI * 2);
      expect(face.getObjectByName('minute-hand')!.rotation.z).toBeCloseTo(-Math.PI);
    }
  });

  test('沒有鐘樓資料時安全略過', () => {
    const tower = buildClockTower();
    expect(tower.group.children).toHaveLength(0);
    expect(() => tower.update()).not.toThrow();
  });
});
