import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Grid Screener',
  description: 'Grid screener visual app'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
