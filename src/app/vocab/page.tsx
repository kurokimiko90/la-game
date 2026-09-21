import type { Metadata } from 'next';
import { VocabScreen } from '@/components/vocab/VocabScreen';

export const metadata: Metadata = { title: '詞彙本｜記憶小鎮' };

export default function VocabPage() {
  return <VocabScreen />;
}
