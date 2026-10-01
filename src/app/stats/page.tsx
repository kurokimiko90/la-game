import type { Metadata } from 'next';
import { StatsScreen } from '@/components/stats/StatsScreen';

export const metadata: Metadata = { title: '遊玩紀錄｜記憶小鎮' };

export default function StatsPage() {
  return <StatsScreen />;
}
