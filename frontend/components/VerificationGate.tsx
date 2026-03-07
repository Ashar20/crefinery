'use client';

import { useState, useCallback } from 'react';
import { Fingerprint, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useWorldVerification } from '../contexts/WorldVerification';
import {
  IDKitRequestWidget,
  deviceLegacy,
  type RpContext,
} from '@worldcoin/idkit';

interface VerificationGateProps {
  children: React.ReactNode;
}

const appId = process.env.NEXT_PUBLIC_WLD_APP_ID ?? '';
const rpId = process.env.NEXT_PUBLIC_WLD_RP_ID ?? '';
const action = process.env.NEXT_PUBLIC_WLD_ACTION ?? 'verify-human';

export function VerificationGate({ children }: VerificationGateProps) {
  const { isVerified, onVerified } = useWorldVerification();
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isVerified) {
    return <>{children}</>;
  }

  // Step 1: Fetch RP signature from backend, then open widget (same as verify page)
  const startVerification = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        setError('Failed to get RP signature');
        setLoading(false);
        return;
      }

      const rpSig = await res.json();

      setRpContext({
        rp_id: rpId,
        nonce: rpSig.nonce,
        created_at: rpSig.created_at,
        expires_at: rpSig.expires_at,
        signature: rpSig.sig,
      });

      setWidgetOpen(true);
      setLoading(false);
    } catch {
      setError('Network error fetching RP signature');
      setLoading(false);
    }
  };

  // Step 2: Backend verifies the proof via World ID v4 API (same as verify page)
  const handleVerify = async (result: unknown) => {
    const response = await fetch('/api/verify-proof', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rp_id: rpId,
        idkitResponse: result,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.detail ?? data?.error ?? 'Backend verification failed');
    }
  };

  // Step 3: Extract nullifier (same as verify page)
  const onSuccess = (result: Record<string, unknown>) => {
    const responses = (result.responses as Array<Record<string, unknown>>) ?? [];
    const firstResponse = responses[0];

    let nullifier = '';
    if (firstResponse) {
      if (typeof firstResponse.nullifier === 'string') {
        nullifier = firstResponse.nullifier;
      } else if (Array.isArray(firstResponse.session_nullifier) && firstResponse.session_nullifier[0]) {
        nullifier = firstResponse.session_nullifier[0];
      }
    }

    if (nullifier) {
      onVerified(nullifier);
    } else {
      setError('No nullifier received');
    }

    setWidgetOpen(false);
    setRpContext(null);
  };

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="max-w-md w-full mx-auto px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#0c0c0c] border border-neon-900 flex items-center justify-center mx-auto mb-6">
          <Fingerprint className="w-8 h-8 text-neon-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3 font-mono">
          HUMAN VERIFICATION REQUIRED
        </h2>
        <p className="text-gray-400 font-mono text-sm mb-6">
          Verify your identity with World ID to access this section.
          This generates a zero-knowledge proof without revealing personal information.
        </p>

        {error && (
          <div className="flex items-center gap-2 justify-center text-red-400 text-sm mb-4 font-mono">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={startVerification}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-neon-500 text-black font-bold font-mono text-sm flex items-center justify-center gap-2 hover:bg-neon-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              VERIFYING...
            </>
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" />
              VERIFY WITH WORLD ID
            </>
          )}
        </button>

        <p className="text-[10px] text-gray-600 mt-4 font-mono">
          Powered by World ID v4 &middot; Device-level verification
        </p>
      </div>

      {/* IDKitRequestWidget — same pattern as /verify page */}
      {rpContext && (
        <IDKitRequestWidget
          open={widgetOpen}
          onOpenChange={setWidgetOpen}
          app_id={appId as `app_${string}`}
          action={action}
          rp_context={rpContext}
          preset={deviceLegacy()}
          allow_legacy_proofs
          handleVerify={handleVerify as any}
          onSuccess={onSuccess as any}
        />
      )}
    </div>
  );
}
