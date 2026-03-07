'use client';

import { useAccount } from 'wagmi';
import { ModelRegistry } from '../../components/ModelRegistry';
import MatrixRain from '../../components/MatrixRain';
import Link from 'next/link';
import { Database, Server, Activity } from 'lucide-react';
import { CyberConnectButton } from '../../components/CyberConnectButton';
import { VerificationGate } from '../../components/VerificationGate';

export default function AdminPage() {
  const { address, isConnected } = useAccount();

  return (
    <div className="min-h-screen relative text-neon-50 selection:bg-neon-500 selection:text-black">
      <MatrixRain />

      {/* Global Overlay Effects */}
      <div className="scanlines"></div>
      <div className="vignette"></div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-40 border-b border-neon-900/30 bg-black/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-neon-500 text-black flex items-center justify-center font-bold font-mono text-xl rounded-sm">
              P
            </div>
            <span className="text-2xl font-bold tracking-tighter font-mono text-white">PURESAPIENS<span className="text-neon-500 animate-pulse">_</span></span>
          </div>
          <div className="hidden md:flex space-x-8 text-sm font-mono text-gray-400">
            <Link href="/" className="hover:text-neon-500 transition-colors hover:underline decoration-neon-500 underline-offset-4">HOME</Link>
            <Link href="/chatbot" className="hover:text-neon-500 transition-colors hover:underline decoration-neon-500 underline-offset-4">CHATBOT</Link>
            <Link href="/admin/register-model" className="hover:text-neon-500 transition-colors hover:underline decoration-neon-500 underline-offset-4">REGISTER</Link>
          </div>
          <div className="flex items-center space-x-4">
            {isConnected && address && (
              <span className="text-sm font-mono text-neon-400 hidden md:block">
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
            )}
            <CyberConnectButton />
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-24 pb-20">
        <VerificationGate>
        {/* Header Section */}
        <section className="max-w-7xl mx-auto px-6 py-12">
          <div className="text-center mb-12">
            <div className="mb-6 inline-flex items-center space-x-2 bg-neon-900/20 border border-neon-900 px-3 py-1 rounded-full">
              <span className="w-2 h-2 bg-neon-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-mono text-neon-400 tracking-widest">ADMIN PANEL // MODEL REGISTRY</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white font-mono">
              MODEL REGISTRY
            </h1>
            <p className="text-gray-400 font-mono text-sm">
              Manage and deploy AI models with AES-256-GCM encryption
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-cyber-panel border border-neon-900/50 p-6 rounded-lg neon-box-glow">
              <div className="flex items-center justify-between mb-4">
                <Database className="w-8 h-8 text-neon-500" />
                <span className="text-xs font-mono text-neon-800 border border-neon-900 px-2 py-1">REGISTRY</span>
              </div>
              <div className="text-3xl font-bold text-white mb-2 font-mono">MODELS</div>
              <div className="text-xs text-neon-600 tracking-widest uppercase">Encrypted Storage</div>
            </div>

            <div className="bg-cyber-panel border border-neon-900/50 p-6 rounded-lg neon-box-glow">
              <div className="flex items-center justify-between mb-4">
                <Server className="w-8 h-8 text-neon-500" />
                <span className="text-xs font-mono text-neon-800 border border-neon-900 px-2 py-1">DEPLOY</span>
              </div>
              <div className="text-3xl font-bold text-white mb-2 font-mono">ACTIVE</div>
              <div className="text-xs text-neon-600 tracking-widest uppercase">Running Instances</div>
            </div>

            <div className="bg-cyber-panel border border-neon-900/50 p-6 rounded-lg neon-box-glow">
              <div className="flex items-center justify-between mb-4">
                <Activity className="w-8 h-8 text-neon-500" />
                <span className="text-xs font-mono text-neon-800 border border-neon-900 px-2 py-1">STATUS</span>
              </div>
              <div className="text-3xl font-bold text-white mb-2 font-mono">ONLINE</div>
              <div className="text-xs text-neon-600 tracking-widest uppercase">System Operational</div>
            </div>
          </div>

          {/* Main Content Card */}
          <div className="bg-cyber-panel border border-neon-900/50 rounded-lg neon-box-glow overflow-hidden">
            <div className="border-b border-neon-900/50 p-4 bg-cyber-dark">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white font-mono">REGISTERED MODELS</h2>
                <Link
                  href="/admin/register-model"
                  className="bg-neon-500 text-black px-4 py-2 font-bold font-mono text-sm hover:bg-neon-400 transition-all hover:scale-105 shadow-[0_0_20px_rgba(0,255,65,0.3)]"
                >
                  + REGISTER NEW
                </Link>
              </div>
            </div>
            <div className="p-6">
            <ModelRegistry />
            </div>
          </div>
        </section>
        </VerificationGate>
      </main>
    </div>
  );
}
