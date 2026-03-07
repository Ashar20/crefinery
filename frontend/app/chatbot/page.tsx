'use client';

import { useAccount } from 'wagmi';
import { CyberConnectButton } from '../../components/CyberConnectButton';
import { useState, useEffect, useRef } from 'react';
import { useWebSocketChat, type ChatMessage } from '../../hooks/useWebSocketChat';
import { Terminal as TerminalIcon, Send, ShieldCheck, Server, Cpu, Activity, Power } from 'lucide-react';
import MatrixRain from '../../components/MatrixRain';
import { VerificationGate } from '../../components/VerificationGate';
import { useWorldVerification } from '../../contexts/WorldVerification';

interface ModelResponse {
  id: string;
  metadata: {
    name: string;
    company: string;
    parameters: string;
    goodAt: string;
    needsImprovement: string;
  };
  uploaderAddress: string;
  createdAt: string;
  dockerfileHash: string;
  metadataHash: string;
}

interface DeployedModel extends ModelResponse {
  port: number;
  containerName: string;
  status: string;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ChatbotPage() {
  const { address, isConnected } = useAccount();
  const { isVerified, nullifierHash } = useWorldVerification();
  const [models, setModels] = useState<ModelResponse[]>([]);
  const [deployedModels, setDeployedModels] = useState<DeployedModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<DeployedModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // WebSocket hook
  const {
    connectionState,
    messages,
    sessionInfo,
    error,
    connect,
    disconnect,
    createSession,
    sendMessage,
    closeSession,
    clearMessages,
    clearError
  } = useWebSocketChat();

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-create session when connection becomes authenticated and model is selected
  useEffect(() => {
    if (connectionState === 'connected' && selectedModel && !sessionInfo?.sessionId) {
      createSession(selectedModel.id, nullifierHash || undefined);
    }
  }, [connectionState, selectedModel, sessionInfo, createSession, nullifierHash]);

  // Fetch models and check deployment status
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);

        // Fetch all models
        const modelsResponse = await fetch(`${API_URL}/models`);
        if (!modelsResponse.ok) {
          throw new Error('Failed to fetch models');
        }
        const modelsData: { models: ModelResponse[]; count: number } = await modelsResponse.json();
        setModels(modelsData.models);

        // Check which models are deployed
        const deployed: DeployedModel[] = [];
        for (const model of modelsData.models) {
          try {
            const deploymentResponse = await fetch(`${API_URL}/models/${model.id}/deployment`);
            if (deploymentResponse.ok) {
              const deploymentData = await deploymentResponse.json();
              deployed.push({
                ...model,
                port: deploymentData.port,
                containerName: deploymentData.containerName,
                status: deploymentData.status,
                createdAt: deploymentData.createdAt
              });
            }
          } catch (error) {
            console.log(`Model ${model.id} not deployed`);
          }
        }

        setDeployedModels(deployed);
      } catch (error) {
        console.error('Failed to fetch models:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  // Handle model selection
  const handleModelSelect = (model: DeployedModel | null) => {
    setSelectedModel(model);
    if (model) {
      clearMessages();
      clearError();

      if (connectionState !== 'connected') {
        connect();
        return;
      }

      createSession(model.id, nullifierHash || undefined);
    }
  };

  // Handle sending messages
  const handleSendMessage = () => {
    if (messageInput.trim() && sessionInfo?.status === 'active') {
      sendMessage(messageInput.trim());
      setMessageInput('');
    }
  };

  // Handle key press in input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle ending session (triggers CRE session evaluator on backend)
  const handleEndSession = () => {
    if (sessionInfo?.status === 'active' || sessionInfo?.status === 'creating_session') {
      closeSession();
      setSelectedModel(null);
    }
  };

  // Format timestamp
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  if (!isConnected || !address) {
    return (
      <div className="min-h-screen relative text-neon-50 selection:bg-neon-500 selection:text-black">
        <MatrixRain />
        <div className="scanlines"></div>
        <div className="vignette"></div>

        {/* Navigation */}
        <nav className="fixed top-0 w-full z-40 border-b border-neon-900/30 bg-black/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-neon-500 text-black flex items-center justify-center font-bold font-mono text-xl rounded-sm">
                F
              </div>
              <span className="text-2xl font-bold tracking-tighter font-mono text-white">PURESAPIENS<span className="text-neon-500 animate-pulse">_</span></span>
            </div>
            <CyberConnectButton />
          </div>
        </nav>

        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md mx-auto px-6">
            <ShieldCheck className="w-16 h-16 text-neon-500 mx-auto mb-6 animate-pulse" />
            <h2 className="text-3xl font-bold text-white mb-4 font-mono">
              AUTHENTICATION REQUIRED
            </h2>
            <p className="text-gray-400 mb-8 font-mono text-sm">
              Connect your wallet to access the secure AI inference terminal.
            </p>
            <CyberConnectButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative text-neon-50 selection:bg-neon-500 selection:text-black">
      <MatrixRain />
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
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2 text-xs font-mono text-neon-700">
              <Activity className="w-3 h-3" />
              <span>USER: {address.slice(0, 6)}...{address.slice(-4)}</span>
            </div>
            <CyberConnectButton />
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-24 pb-8 px-6">
        <VerificationGate>
        <div className="max-w-6xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-8">
            <div className="mb-4 inline-flex items-center space-x-2 bg-neon-900/20 border border-neon-900 px-3 py-1 rounded-full">
              <span className="w-2 h-2 bg-neon-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-mono text-neon-400 tracking-widest">SECURE INFERENCE TERMINAL</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 font-mono">
              LIVE ENCLAVE INTERFACE
            </h1>
            <p className="text-gray-400 font-mono text-sm">
              Test the secure inference pipeline. All inputs are encrypted client-side.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-neon-500 border-t-transparent"></div>
              <p className="text-neon-500 mt-4 font-mono text-sm animate-pulse">INITIALIZING SYSTEM...</p>
            </div>
          ) : deployedModels.length === 0 ? (
            <div className="text-center py-20">
              <Cpu className="w-16 h-16 text-neon-800 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-white mb-4 font-mono">
                NO DEPLOYED MODELS
              </h2>
              <p className="text-gray-400 font-mono text-sm">
                Deploy a model first to access the inference terminal.
              </p>
            </div>
          ) : (
            <div className="w-full max-w-5xl mx-auto relative font-mono">
              {/* CRT Bezel */}
              <div className="absolute inset-0 border-2 border-neon-800 rounded-lg pointer-events-none z-20 neon-box-glow opacity-50"></div>

              {/* Header */}
              <div className="bg-cyber-panel border-b border-neon-900 p-3 flex items-center justify-between rounded-t-lg">
                <div className="flex items-center space-x-2">
                  <TerminalIcon className="w-4 h-4 text-neon-500" />
                  <span className="text-neon-500 font-bold tracking-widest text-sm">PURESAPIENS_SECURE_SHELL_V1.0</span>
                </div>
                <div className="flex items-center space-x-4 text-xs text-neon-700">
                  <div className="flex items-center">
                    <ShieldCheck className="w-3 h-3 mr-1" />
                    <span>ENCLAVE: {connectionState === 'connected' ? 'ACTIVE' : 'OFFLINE'}</span>
                  </div>
                  <div className="flex items-center">
                    <Server className="w-3 h-3 mr-1" />
                    <span>EVM: {isConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
                  </div>
                </div>
              </div>

              {/* Model Selection Bar */}
              <div className="bg-cyber-dark border-b border-neon-900/50 p-3">
                <div className="flex items-center space-x-3">
                  <label className="text-neon-500 text-xs font-bold tracking-wider">MODEL:</label>
                  <select
                    value={selectedModel?.id || ''}
                    onChange={(e) => {
                      const model = deployedModels.find(m => m.id === e.target.value);
                      handleModelSelect(model || null);
                    }}
                    className="flex-1 bg-black/50 border border-neon-900 text-neon-400 px-3 py-1 text-sm focus:outline-none focus:border-neon-500 transition-colors"
                  >
                    <option value="">SELECT_MODEL...</option>
                    {deployedModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.metadata.name.toUpperCase()} - {model.metadata.company.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  {selectedModel && (
                    <>
                      <span className="text-neon-700 text-xs border border-neon-900 px-2 py-1">
                        PORT:{selectedModel.port}
                      </span>
                      <button
                        onClick={handleEndSession}
                        disabled={!sessionInfo || (sessionInfo.status !== 'active' && sessionInfo.status !== 'creating_session')}
                        className="flex items-center space-x-1 text-xs border border-red-900 px-2 py-1 text-red-400 hover:bg-red-900/30 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Power className="w-3 h-3" />
                        <span>END SESSION</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-900/20 border-b border-red-500/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-red-400 text-xs font-mono">ERROR: {error}</span>
                    <button
                      onClick={clearError}
                      className="text-red-500 hover:text-red-400 text-xs"
                    >
                      [DISMISS]
                    </button>
                  </div>
                </div>
              )}

              {/* Chat/Log Area */}
              <div className="bg-black/90 p-4 h-96 overflow-y-auto relative border-l border-r border-neon-900/50">
                {/* Scanline overlay */}
                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 bg-[length:100%_2px,3px_100%] bg-repeat"></div>

                <div className="relative z-10 space-y-2">
                  {messages.length === 0 ? (
                    <div className="space-y-2 text-neon-700 text-sm">
                      <div className="flex items-start animate-fade-in">
                        <span className="text-gray-600 mr-3 shrink-0 select-none">[{new Date().toLocaleTimeString()}]</span>
                        <span>System initialized.</span>
                      </div>
                      <div className="flex items-start animate-fade-in">
                        <span className="text-gray-600 mr-3 shrink-0 select-none">[{new Date().toLocaleTimeString()}]</span>
                        <span className="text-neon-400">Connected to Secure TEE Enclave.</span>
                      </div>
                      <div className="flex items-start animate-fade-in">
                        <span className="text-gray-600 mr-3 shrink-0 select-none">[{new Date().toLocaleTimeString()}]</span>
                        <span className="text-gray-300">Waiting for secure input...</span>
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className="flex items-start animate-fade-in">
                        <span className="text-gray-600 mr-3 shrink-0 select-none text-xs">
                          [{formatTime(message.timestamp)}]
                        </span>
                        <span className={`break-words text-sm ${
                          message.type === 'user' ? 'text-neon-700' :
                          message.type === 'assistant' ? 'text-neon-400' :
                          'text-gray-300'
                        }`}>
                          {message.type === 'user' ? '> ' : ''}{message.content}
                        </span>
                      </div>
                    ))
                  )}
                  {connectionState === 'connecting' && (
                    <div className="text-yellow-400 animate-pulse text-sm">
                      _ Establishing secure connection...
                    </div>
                  )}
                  {connectionState === 'authenticating' && (
                    <div className="text-yellow-400 animate-pulse text-sm">
                      _ Authenticating with enclave...
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input Area */}
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="bg-cyber-panel p-3 border-t border-neon-900 rounded-b-lg flex items-center relative z-30">
                <span className="text-neon-500 mr-2 font-bold">$</span>
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={sessionInfo?.status !== 'active'}
                  className="bg-transparent text-neon-50 w-full focus:outline-none font-mono placeholder-gray-700 text-sm"
                  placeholder={
                    sessionInfo?.status === 'active'
                      ? "Enter prompt for secure inference..."
                      : selectedModel
                        ? "Initializing session..."
                        : "Select a model to begin..."
                  }
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={sessionInfo?.status !== 'active' || !messageInput.trim()}
                  className="text-neon-500 hover:text-neon-400 disabled:text-gray-700 transition-colors ml-2"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>

              {/* Status Bar */}
              <div className="bg-cyber-dark border-t border-neon-900/50 p-2 rounded-b-lg flex items-center justify-between text-xs text-neon-800">
                <div className="flex items-center space-x-4">
                  <span>STATUS: {connectionState.toUpperCase()}</span>
                  {sessionInfo && (
                    <span>SESSION: {sessionInfo.status.toUpperCase()}</span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${
                    connectionState === 'connected' ? 'bg-neon-500 animate-pulse' :
                    connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                    'bg-gray-700'
                  }`}></span>
                  <span>ENCRYPTION: AES-256</span>
                </div>
              </div>
            </div>
          )}
        </div>
        </VerificationGate>
      </main>
    </div>
  );
}
