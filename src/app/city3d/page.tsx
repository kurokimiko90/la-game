import type { Metadata } from 'next';
import { GameScreen3D } from '@/components/city3d/GameScreen3D';

export const metadata: Metadata = { title: '商業街 · 銀座 3D' };

export default function City3DPage() {
  return <GameScreen3D />;
}
