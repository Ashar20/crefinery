"use client"

import { useState, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  IDKitRequestWidget,
  deviceLegacy,
  type RpContext,
} from "@worldcoin/idkit"
import {
  ShieldCheck,
  Fingerprint,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  Loader2,
  LinkIcon,
} from "lucide-react"
import { useAccount } from "wagmi"
import { Navbar } from "@/components/Navbar"
import { cn } from "@/lib/utils"

type AllowlistResult = {
  chain: string
  status: string
  txHash?: string
  error?: string
}

type VerifyState =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "verified_worldid"; nullifier: string; protocolVersion: string }
  | { status: "allowlisting"; nullifier: string; protocolVersion: string }
  | { status: "success"; nullifier: string; protocolVersion: string; allowlistResults: AllowlistResult[] }
  | { status: "error"; message: string }

export default function VerifyPage() {
  const [state, setState] = useState<VerifyState>({ status: "idle" })
  const [copied, setCopied] = useState(false)
  const [widgetOpen, setWidgetOpen] = useState(false)
  const [rpContext, setRpContext] = useState<RpContext | null>(null)
  const { address: walletAddress, isConnected } = useAccount()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const appId = process.env.NEXT_PUBLIC_WLD_APP_ID ?? ""
  const rpId = process.env.NEXT_PUBLIC_WLD_RP_ID ?? ""
  const action = process.env.NEXT_PUBLIC_WLD_ACTION ?? "verify-human"

  const hasConfig = appId && rpId

  // Step 1: Fetch RP signature from backend, then open widget
  const startVerification = useCallback(async () => {
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      })

      if (!res.ok) {
        setState({ status: "error", message: "Failed to get RP signature" })
        return
      }

      const rpSig = await res.json()

      setRpContext({
        rp_id: rpId,
        nonce: rpSig.nonce,
        created_at: rpSig.created_at,
        expires_at: rpSig.expires_at,
        signature: rpSig.sig,
      })

      setWidgetOpen(true)
    } catch (err) {
      setState({ status: "error", message: "Network error fetching RP signature" })
    }
  }, [action, rpId])

  // Step 2: Backend verifies the proof via World ID v4 API
  const handleVerify = useCallback(async (result: unknown) => {
    setState({ status: "verifying" })

    const response = await fetch("/api/verify-proof", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rp_id: rpId,
        idkitResponse: result,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data?.detail ?? data?.error ?? "Backend verification failed")
    }
  }, [rpId])

  // Step 3: Extract nullifier and trigger on-chain allowlisting
  const onSuccess = useCallback(async (result: Record<string, unknown>) => {
    const protocolVersion = (result.protocol_version as string) ?? "unknown"
    const responses = (result.responses as Array<Record<string, unknown>>) ?? []
    const firstResponse = responses[0]

    // v3 uses "nullifier", v4 session uses "session_nullifier" (array)
    let nullifier = "—"
    if (firstResponse) {
      if (typeof firstResponse.nullifier === "string") {
        nullifier = firstResponse.nullifier
      } else if (Array.isArray(firstResponse.session_nullifier) && firstResponse.session_nullifier[0]) {
        nullifier = firstResponse.session_nullifier[0]
      }
    }

    // If wallet is connected, trigger on-chain allowlisting
    if (walletAddress && nullifier !== "—") {
      setState({ status: "allowlisting", nullifier, protocolVersion })
      try {
        const res = await fetch("/api/allowlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ walletAddress, nullifierHash: nullifier }),
        })
        const data = await res.json()
        setState({
          status: "success",
          nullifier,
          protocolVersion,
          allowlistResults: data.results ?? [],
        })
      } catch {
        setState({
          status: "success",
          nullifier,
          protocolVersion,
          allowlistResults: [{ chain: "all", status: "error", error: "Failed to reach backend" }],
        })
      }
    } else {
      setState({
        status: "success",
        nullifier,
        protocolVersion,
        allowlistResults: [],
      })
    }
  }, [walletAddress])

  const handleCopy = () => {
    if (state.status === "success") {
      navigator.clipboard.writeText(state.nullifier)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleReset = () => {
    setState({ status: "idle" })
    setWidgetOpen(false)
    setRpContext(null)
    setCopied(false)
  }

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] flex items-center justify-center mx-auto mb-6">
              <Fingerprint className="w-8 h-8 text-[#ededed]" />
            </div>
            <h1 className="text-3xl font-bold text-[#ededed] tracking-tight mb-3">
              Proof of Personhood
            </h1>
            <p className="text-[#737373] text-sm leading-relaxed max-w-md mx-auto">
              Verify your unique human identity with World ID. This generates a
              zero-knowledge proof without revealing any personal information.
            </p>
          </motion.div>

          {/* Main Card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] overflow-hidden"
          >
            <AnimatePresence mode="wait">
              {/* Idle State */}
              {state.status === "idle" && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-8"
                >
                  <div className="space-y-4 mb-8">
                    {[
                      {
                        label: "Privacy Preserving",
                        desc: "Zero-knowledge proof — no personal data shared",
                      },
                      {
                        label: "Sybil Resistant",
                        desc: "Each person can only verify once per action",
                      },
                      {
                        label: "Nullifier Hash",
                        desc: "Unique identifier returned, usable for on-chain gating",
                      },
                    ].map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 + i * 0.08 }}
                        className="flex gap-4 p-4 rounded-xl bg-[#171717]/50 border border-[#1e1e1e]/50"
                      >
                        <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-[#ededed]">{item.label}</p>
                          <p className="text-xs text-[#737373] mt-0.5">{item.desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {mounted && !isConnected && (
                    <div className="w-full py-3 rounded-xl bg-[#171717] border border-[#1e1e1e] text-center mb-4">
                      <p className="text-xs text-amber-400">Connect your wallet first to enable on-chain allowlisting</p>
                    </div>
                  )}

                  {hasConfig ? (
                    <button
                      type="button"
                      onClick={startVerification}
                      disabled={!mounted || !isConnected}
                      className={cn(
                        "w-full py-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors",
                        mounted && isConnected
                          ? "bg-white text-black hover:bg-white/90 cursor-pointer"
                          : "bg-[#333] text-[#737373] cursor-not-allowed"
                      )}
                    >
                      <Fingerprint className="w-5 h-5" />
                      Verify with World ID
                    </button>
                  ) : (
                    <div className="w-full py-4 rounded-xl bg-[#171717] border border-[#1e1e1e] text-center">
                      <p className="text-sm text-red-400 font-medium">Missing World ID configuration</p>
                      <p className="text-xs text-[#737373] mt-1">
                        Set NEXT_PUBLIC_WLD_APP_ID, NEXT_PUBLIC_WLD_RP_ID, and RP_SIGNING_KEY in .env.local
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] text-[#737373] text-center mt-4 leading-relaxed">
                    Powered by World ID v4 &middot; Device-level verification
                  </p>
                </motion.div>
              )}

              {/* Verifying State */}
              {state.status === "verifying" && (
                <motion.div
                  key="verifying"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-8 flex flex-col items-center justify-center min-h-[320px]"
                >
                  <Loader2 className="w-10 h-10 text-[#ededed] animate-spin mb-4" />
                  <p className="text-sm text-[#ededed] font-medium">Verifying proof...</p>
                  <p className="text-xs text-[#737373] mt-1">Checking with World ID v4 API</p>
                </motion.div>
              )}

              {/* Allowlisting State */}
              {state.status === "allowlisting" && (
                <motion.div
                  key="allowlisting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-8 flex flex-col items-center justify-center min-h-[320px]"
                >
                  <Loader2 className="w-10 h-10 text-[#ededed] animate-spin mb-4" />
                  <p className="text-sm text-[#ededed] font-medium">Allowlisting on-chain...</p>
                  <p className="text-xs text-[#737373] mt-1">Writing to all 3 chains (Base Sepolia, Arb Sepolia, Avalanche Fuji)</p>
                </motion.div>
              )}

              {/* Success State */}
              {state.status === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-8"
                >
                  <div className="flex flex-col items-center mb-8">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                      className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4"
                    >
                      <ShieldCheck className="w-8 h-8 text-emerald-400" />
                    </motion.div>
                    <h2 className="text-xl font-bold text-[#ededed] mb-1">Verified Human</h2>
                    <p className="text-xs text-[#737373]">World ID Device verification successful</p>
                  </div>

                  {/* Nullifier */}
                  <div className="rounded-xl bg-[#171717] border border-[#1e1e1e] p-4 mb-6">
                    <p className="text-[10px] text-[#737373] uppercase tracking-wider font-medium mb-2">
                      Nullifier
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm text-[#ededed] font-mono break-all leading-relaxed">
                        {state.nullifier}
                      </p>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="flex-shrink-0 p-2 rounded-lg hover:bg-[#1e1e1e] transition-colors cursor-pointer"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-[#737373]" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {[
                      ["Action", action],
                      ["Protocol", `v${state.protocolVersion}`],
                      ["Verification Level", "Device"],
                      ["Status", "Verified"],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between text-sm">
                        <span className="text-[#737373]">{label}</span>
                        <span className="text-[#ededed] font-medium">{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* On-chain allowlist results */}
                  {state.allowlistResults.length > 0 && (
                    <div className="rounded-xl bg-[#171717] border border-[#1e1e1e] p-4 mb-8">
                      <p className="text-[10px] text-[#737373] uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
                        <LinkIcon className="w-3 h-3" /> On-Chain Allowlist
                      </p>
                      <div className="space-y-2">
                        {state.allowlistResults.map((r) => (
                          <div key={r.chain} className="flex items-center justify-between text-sm">
                            <span className="text-[#ededed]">{r.chain}</span>
                            <span className={cn(
                              "text-xs font-medium",
                              r.status === "verified" || r.status === "already_verified"
                                ? "text-emerald-400"
                                : r.status === "pending_sync"
                                ? "text-amber-400"
                                : "text-red-400"
                            )}>
                              {r.status === "verified" ? "Allowlisted" :
                               r.status === "already_verified" ? "Already Allowlisted" :
                               r.status === "pending_sync" ? "Syncing via CRE..." :
                               "Failed"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="flex-1 py-3 rounded-xl bg-[#171717] border border-[#1e1e1e] text-[#ededed] text-sm font-medium hover:bg-[#1e1e1e] transition-colors cursor-pointer"
                    >
                      Verify Again
                    </button>
                    <a
                      href="https://docs.world.org/world-id"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-[#171717] border border-[#1e1e1e] text-[#737373] text-sm font-medium hover:text-[#ededed] hover:bg-[#1e1e1e] transition-colors"
                    >
                      Docs <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </motion.div>
              )}

              {/* Error State */}
              {state.status === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-8 flex flex-col items-center justify-center min-h-[320px]"
                >
                  <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
                    <AlertCircle className="w-7 h-7 text-red-400" />
                  </div>
                  <h2 className="text-lg font-bold text-[#ededed] mb-1">Verification Failed</h2>
                  <p className="text-xs text-[#737373] mb-6 text-center max-w-xs">
                    {state.message}
                  </p>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-6 py-3 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors cursor-pointer"
                  >
                    Try Again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* IDKitRequestWidget — rendered but only opens when widgetOpen=true */}
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
      </main>
    </div>
  )
}
