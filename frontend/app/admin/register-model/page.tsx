'use client';

import { useAccount } from 'wagmi';
import { ModelRegistry } from '../../../components/ModelRegister';
import MatrixRain from '../../../components/MatrixRain';
import Link from 'next/link';
import { Upload, FileText, Shield } from 'lucide-react';
import { CyberConnectButton } from '../../../components/CyberConnectButton';

export default function RegisterModelPage() {
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
            <Link href="/admin" className="hover:text-neon-500 transition-colors hover:underline decoration-neon-500 underline-offset-4">ADMIN</Link>
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
        <section className="max-w-5xl mx-auto px-6 py-12">
          {/* Header Section */}
          <div className="text-center mb-12">
            <div className="mb-6 inline-flex items-center space-x-2 bg-neon-900/20 border border-neon-900 px-3 py-1 rounded-full">
              <span className="w-2 h-2 bg-neon-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-mono text-neon-400 tracking-widest">MODEL REGISTRATION // AES-256-GCM ENCRYPTION</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white font-mono">
              REGISTER NEW MODEL
            </h1>
            <p className="text-gray-400 font-mono text-sm">
              Upload and encrypt your AI model with AES-256-GCM on EVM
            </p>
          </div>

          {/* Main Registration Card */}
          <div className="bg-cyber-panel border border-neon-900/50 rounded-lg neon-box-glow overflow-hidden">
            {/* Card Header */}
            <div className="border-b border-neon-900/50 p-4 bg-cyber-dark">
              <div className="flex items-center space-x-3">
                <Upload className="w-5 h-5 text-neon-500" />
                <h2 className="text-xl font-bold text-white font-mono">MODEL REGISTRATION FORM</h2>
              </div>
            </div>

            {/* Card Content */}
            <div className="p-6">
              {!isConnected ? (
                <div className="text-center py-12">
                  <Shield className="w-16 h-16 text-neon-800 mx-auto mb-6" />
                  <h3 className="text-2xl font-bold text-white mb-4 font-mono">
                    AUTHENTICATION REQUIRED
                  </h3>
                  <p className="text-gray-400 font-mono text-sm mb-6">
                    Connect your wallet to register AI models.
                  </p>
                  <CyberConnectButton />
                </div>
              ) : (
          <ModelRegistry />
              )}
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="bg-cyber-panel border border-neon-900/50 p-4 rounded-lg">
              <div className="flex items-center space-x-3 mb-3">
                <FileText className="w-5 h-5 text-neon-500" />
                <span className="text-sm font-mono text-white font-bold">DOCKERFILE</span>
              </div>
              <p className="text-xs text-gray-400 font-mono">
                Upload your Dockerfile for containerized deployment
              </p>
            </div>

            <div className="bg-cyber-panel border border-neon-900/50 p-4 rounded-lg">
              <div className="flex items-center space-x-3 mb-3">
                <Shield className="w-5 h-5 text-neon-500" />
                <span className="text-sm font-mono text-white font-bold">AES-256-GCM</span>
              </div>
              <p className="text-xs text-gray-400 font-mono">
                All data encrypted end-to-end with AES-256-GCM
              </p>
            </div>

            <div className="bg-cyber-panel border border-neon-900/50 p-4 rounded-lg">
              <div className="flex items-center space-x-3 mb-3">
                <Upload className="w-5 h-5 text-neon-500" />
                <span className="text-sm font-mono text-white font-bold">ON-CHAIN</span>
              </div>
              <p className="text-xs text-gray-400 font-mono">
                Metadata stored securely on EVM blockchain
              </p>
            </div>
          </div>
        </section>
        </main>
    </div>
  );
}
