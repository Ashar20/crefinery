"use client";

import React from 'react';
import { Shield, Lock, HardDrive, EyeOff, Cpu, Database, Network } from 'lucide-react';
import MatrixRain from '../components/MatrixRain';
import Terminal from '../components/Terminal';
import FeatureCard from '../components/FeatureCard';
import GlitchText from '../components/GlitchText';
import { CyberConnectButton } from '../components/CyberConnectButton';

export default function Home() {
  return (
    <div className="min-h-screen relative text-neon-50 selection:bg-neon-500 selection:text-black font-sans">
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
            <a href="#architecture" className="hover:text-neon-500 transition-colors hover:underline decoration-neon-500 underline-offset-4">ARCHITECTURE</a>
            <a href="#demo" className="hover:text-neon-500 transition-colors hover:underline decoration-neon-500 underline-offset-4">LIVE_DEMO</a>
            <a href="/chatbot" className="hover:text-neon-500 transition-colors hover:underline decoration-neon-500 underline-offset-4">CHATBOT</a>
            <a href="/admin" className="hover:text-neon-500 transition-colors hover:underline decoration-neon-500 underline-offset-4">ADMIN</a>
          </div>
          <CyberConnectButton />
        </div>
      </nav>

      <main className="relative z-10 pt-24 pb-20">

        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 min-h-[80vh] flex flex-col justify-center items-center text-center">
          <div className="mb-6 inline-flex items-center space-x-2 bg-neon-900/20 border border-neon-900 px-3 py-1 rounded-full">
            <span className="w-2 h-2 bg-neon-500 rounded-full animate-pulse"></span>
            <span className="text-xs font-mono text-neon-400 tracking-widest">SYSTEM ONLINE // CONFIDENTIAL COMPUTING</span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight mb-6 tracking-tight text-white">
            AI THAT <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-400 to-neon-600"><GlitchText text="NEVER" /></span><br />
            LEAKS YOUR DATA
          </h1>

          <p className="max-w-2xl text-gray-400 text-lg md:text-xl mb-10 font-mono">
            Decentralized inference & training with end-to-end encryption.
            Powered by Chainlink CRE on EVM.
            <br/>
            <span className="text-neon-700 text-sm block mt-2">Platform Visibility: 0%</span>
          </p>

          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-6">
            <button className="bg-neon-500 text-black px-8 py-4 font-bold font-mono text-lg hover:bg-neon-400 transition-all hover:scale-105 shadow-[0_0_20px_rgba(0,255,65,0.3)]">
               INITIALIZE_NODE
            </button>
            <button className="border border-gray-700 text-gray-300 px-8 py-4 font-bold font-mono text-lg hover:border-neon-500 hover:text-neon-500 transition-all">
              READ_WHITEPAPER
            </button>
          </div>

          {/* Decorative Grid Line */}
          <div className="w-px h-24 bg-gradient-to-b from-neon-900 to-transparent mt-20"></div>
        </section>

        {/* Demo Section */}
        <section id="demo" className="max-w-5xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">LIVE ENCLAVE INTERFACE</h2>
            <p className="text-gray-400 font-mono">Test the secure inference pipeline. All inputs are encrypted client-side.</p>
          </div>
          <Terminal />
        </section>

        {/* Architecture / Features Grid */}
        <section id="architecture" className="max-w-7xl mx-auto px-6 py-20">
          <div className="flex items-end justify-between mb-12 border-b border-neon-900/50 pb-4">
            <h2 className="text-4xl font-bold">SYSTEM ARCHITECTURE</h2>
            <span className="hidden md:block font-mono text-neon-800">STATUS: OPERATIONAL</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              title="Chainlink CRE"
              description="Decentralized oracle workflows for verifiable proofs. Trustless computation verified on-chain through Chainlink's Compute Runtime Environment."
              icon={<Cpu className="w-6 h-6" />}
              techSpec="CRE-ORC-V1"
              delay={0}
            />
             <FeatureCard
              title="AES-256-GCM"
              description="Military-grade encryption for all model data. Authenticated encryption ensures both confidentiality and integrity at every layer."
              icon={<Lock className="w-6 h-6" />}
              techSpec="ENC-AES-256"
              delay={100}
            />
             <FeatureCard
              title="Decentralized Storage"
              description="Encrypted IPFS storage for sessions via Pinata. No central servers. Data is pinned and replicated across the IPFS network."
              icon={<Database className="w-6 h-6" />}
              techSpec="DEC-STR-256"
              delay={200}
            />
             <FeatureCard
              title="Zero Knowledge"
              description="The PureSapiens platform facilitates the connection but never decrypts the payload. Only the user and the enclave hold the keys."
              icon={<EyeOff className="w-6 h-6" />}
              techSpec="ZK-PRF-00"
              delay={300}
            />
          </div>
        </section>

        {/* Stats / Trust Section */}
        <section className="border-t border-b border-neon-900/30 bg-cyber-panel/50 backdrop-blur-sm py-16">
            <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center font-mono">
                <div>
                    <div className="text-4xl font-bold text-white mb-2">0.00</div>
                    <div className="text-xs text-neon-600 tracking-widest uppercase">Data Leaks</div>
                </div>
                <div>
                    <div className="text-4xl font-bold text-white mb-2">&lt;50ms</div>
                    <div className="text-xs text-neon-600 tracking-widest uppercase">Enclave Latency</div>
                </div>
                <div>
                    <div className="text-4xl font-bold text-white mb-2">AES-256</div>
                    <div className="text-xs text-neon-600 tracking-widest uppercase">Encryption Std</div>
                </div>
                <div>
                    <div className="text-4xl font-bold text-white mb-2">100%</div>
                    <div className="text-xs text-neon-600 tracking-widest uppercase">Verifiable</div>
                </div>
            </div>
        </section>

        {/* Footer */}
        <footer className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row justify-between items-center text-sm font-mono text-gray-600">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
             <div className="w-4 h-4 bg-neon-900 flex items-center justify-center text-[10px] text-neon-500">F</div>
             <span>© 2024 PURESAPIENS NETWORK</span>
          </div>
          <div className="flex space-x-6">
            <a href="#" className="hover:text-neon-500 transition-colors">GITHUB</a>
            <a href="#" className="hover:text-neon-500 transition-colors">DISCORD</a>
            <a href="#" className="hover:text-neon-500 transition-colors">X (TWITTER)</a>
          </div>
        </footer>

      </main>
    </div>
  );
}
