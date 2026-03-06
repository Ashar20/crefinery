import type { Metadata } from 'next';
import './globals.css';
import { ClientProviders } from './client-providers';

export const metadata: Metadata = {
  title: 'PureSapiens | Privacy-Preserving AI',
  description: 'Decentralized inference & training with end-to-end encryption. Powered by Chainlink CRE on EVM.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ClientProviders>
        {children}
        </ClientProviders>
      </body>
    </html>
  );
}

