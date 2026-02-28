import type { Metadata } from 'next';
import { QueryProvider } from '@/providers/query-provider';
import { TokenProvider } from '@/providers/token-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Solana Liveline Chart',
  description: 'Real-time Solana price charts powered by Solana Tracker Data API and Liveline',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <QueryProvider>
          <TokenProvider>{children}</TokenProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
