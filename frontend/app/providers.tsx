'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet, sepolia, baseSepolia, arbitrumSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { WorldVerificationProvider } from '../contexts/WorldVerification';

const config = getDefaultConfig({
  appName: 'PureSapiens',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'puresapiens-dev',
  chains: [sepolia, baseSepolia, arbitrumSepolia, mainnet],
  transports: {
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [mainnet.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <WorldVerificationProvider>
            {children}
          </WorldVerificationProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
