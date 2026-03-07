'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAccount } from 'wagmi';

interface VerificationState {
  isVerified: boolean;
  nullifierHash: string | null;
  walletAddress: string | null;
  verifiedAt: string | null;
}

interface WorldVerificationContextType {
  isVerified: boolean;
  nullifierHash: string | null;
  onVerified: (nullifier: string) => void;
  clearVerification: () => void;
}

const STORAGE_KEY = 'puresapiens_world_verification';

const WorldVerificationContext = createContext<WorldVerificationContextType>({
  isVerified: false,
  nullifierHash: null,
  onVerified: () => {},
  clearVerification: () => {},
});

export function useWorldVerification() {
  return useContext(WorldVerificationContext);
}

function loadVerification(walletAddress: string | undefined): VerificationState | null {
  if (!walletAddress) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: VerificationState = JSON.parse(raw);
    if (data.walletAddress?.toLowerCase() === walletAddress.toLowerCase() && data.isVerified && data.nullifierHash) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function saveVerification(walletAddress: string, nullifierHash: string) {
  const data: VerificationState = {
    isVerified: true,
    nullifierHash,
    walletAddress,
    verifiedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function WorldVerificationProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const [isVerified, setIsVerified] = useState(false);
  const [nullifierHash, setNullifierHash] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load verification from localStorage when wallet changes
  useEffect(() => {
    if (!mounted) return;
    const stored = loadVerification(address);
    if (stored) {
      setIsVerified(true);
      setNullifierHash(stored.nullifierHash);
    } else {
      setIsVerified(false);
      setNullifierHash(null);
    }
  }, [address, mounted]);

  const onVerified = useCallback((nullifier: string) => {
    if (!address) return;
    setIsVerified(true);
    setNullifierHash(nullifier);
    saveVerification(address, nullifier);
  }, [address]);

  const clearVerification = useCallback(() => {
    setIsVerified(false);
    setNullifierHash(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <WorldVerificationContext.Provider value={{
      isVerified,
      nullifierHash,
      onVerified,
      clearVerification,
    }}>
      {children}
    </WorldVerificationContext.Provider>
  );
}
