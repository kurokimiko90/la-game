import type { Metadata, Viewport } from 'next';
import { ProgressProvider } from '@/components/ProgressProvider';
import './globals.css';

export const metadata: Metadata = {
  title: '記憶小鎮 Memory Town',
  description: '在生活場景裡找東西、聽發音，用空間記住英語和日語單字。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f6f2e9',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <ProgressProvider>{children}</ProgressProvider>
      </body>
    </html>
  );
}
