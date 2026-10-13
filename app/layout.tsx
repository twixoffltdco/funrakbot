/**
 * FUN RAKBOT WEB — корневой layout (Next.js App Router).
 * Тёмная тема по умолчанию, шрифт mono для «админ-чат» атмосферы FR_.
 */

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FUN RAKBOT WEB — SA-MP/CRMP браузерный бот',
  description:
    'RakNet keep-alive бот для SA-MP 0.3.7 / CRMP 0.3e прямо из браузера. NO-VPS, Edge Runtime, работает только пока открыта вкладка.',
  openGraph: {
    title: 'FUN RAKBOT WEB',
    description: 'Браузерный RakBot для удержания онлайна на SA-MP/CRMP серверах.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
