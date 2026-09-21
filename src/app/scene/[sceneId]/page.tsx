import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GameScreen } from '@/components/game/GameScreen';
import { getScene, SCENE_ORDER } from '@/lib/scenes';

// 只有四個固定場景，其餘網址一律 404
export const dynamicParams = false;

export function generateStaticParams() {
  return SCENE_ORDER.map((sceneId) => ({ sceneId }));
}

export async function generateMetadata({ params }: PageProps<'/scene/[sceneId]'>): Promise<Metadata> {
  const { sceneId } = await params;
  const scene = getScene(sceneId);
  return { title: scene ? `${scene.name}｜記憶小鎮` : '記憶小鎮' };
}

export default async function ScenePage({ params }: PageProps<'/scene/[sceneId]'>) {
  const { sceneId } = await params;
  const scene = getScene(sceneId);
  if (!scene) notFound();
  return <GameScreen initialSceneId={scene.id} />;
}
