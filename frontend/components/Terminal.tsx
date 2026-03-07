import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { TerminalLog, GenerationState } from '../app/types';
import { Terminal as TerminalIcon, Send, ShieldCheck, Lock, Server, Cpu } from 'lucide-react';

// Initialize with a dummy key if process.env is missing to prevent immediate crash,
// but real calls will need the key.
const API_KEY = process.env.GEMINI_API_KEY || '';

const Terminal: React.FC = () => {
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<TerminalLog[]>([
    { id: '1', text: 'System initialized.', type: 'system', timestamp: new Date().toLocaleTimeString() },
    { id: '2', text: 'Connected to Secure TEE Enclave.', type: 'success', timestamp: new Date().toLocaleTimeString() },
    { id: '3', text: 'Waiting for secure input...', type: 'info', timestamp: new Date().toLocaleTimeString() },
  ]);
  const [state, setState] = useState<GenerationState>(GenerationState.IDLE);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const addLog = (text: string, type: TerminalLog['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      text,
      type,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || state !== GenerationState.IDLE) return;

    const userPrompt = input;
    setInput('');
    setState(GenerationState.ENCRYPTING);
    
    // Step 1: User Input
    addLog(`> ${userPrompt}`, 'system');
    
    // Step 2: Simulate Encryption (The "PureSapiens" Promise)
    setTimeout(() => {
      addLog('Encrypting payload via AES-256-GCM...', 'warning');
      addLog('Data strictly routed to Enclave. Platform has zero visibility.', 'info');
      
      setState(GenerationState.PROCESSING_TEE);
      
      // Step 3: Call Gemini (Simulating the TEE internal logic)
      processAI(userPrompt);
    }, 800);
  };

  const processAI = async (prompt: string) => {
    try {
      addLog('Processing inference inside Secure TEE...', 'warning');
      
      if (!API_KEY) {
        throw new Error("API_KEY_MISSING");
      }

      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            systemInstruction: "You are a highly secure, privacy-focused AI assistant running inside a TEE (Trusted Execution Environment). Keep answers concise, technical, and somewhat cyber-themed. Keep it under 50 words."
        }
      });

      const text = response.text;

      setState(GenerationState.DECRYPTING);
      setTimeout(() => {
        addLog('Inference complete. Output encrypted.', 'success');
        addLog('Decrypting for user display...', 'warning');
        
        setTimeout(() => {
            addLog(text || 'No response generated.', 'success');
            setState(GenerationState.IDLE);
        }, 600);
      }, 800);

    } catch (error: any) {
      console.error(error);
      if (error.message === "API_KEY_MISSING") {
         addLog('ERROR: API Key not found in environment. Demo mode limited.', 'error');
         addLog('Simulated Response: Secure analysis complete. Protocol Green.', 'success');
      } else {
         addLog('Enclave Error: Inference interrupted.', 'error');
      }
      setState(GenerationState.IDLE);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 relative font-mono text-sm sm:text-base">
      {/* CRT Bezel */}
      <div className="absolute inset-0 border-2 border-neon-800 rounded-lg pointer-events-none z-20 neon-box-glow opacity-50"></div>
      
      {/* Header */}
      <div className="bg-cyber-panel border-b border-neon-900 p-3 flex items-center justify-between rounded-t-lg">
        <div className="flex items-center space-x-2">
          <TerminalIcon className="w-4 h-4 text-neon-500" />
          <span className="text-neon-500 font-bold tracking-widest">PURESAPIENS_SECURE_SHELL_V1.0</span>
        </div>
        <div className="flex items-center space-x-4 text-xs text-neon-700">
          <div className="flex items-center">
            <ShieldCheck className="w-3 h-3 mr-1" />
            <span>ENCLAVE: ACTIVE</span>
          </div>
          <div className="flex items-center">
            <Server className="w-3 h-3 mr-1" />
            <span>EVM: CONNECTED</span>
          </div>
        </div>
      </div>

      {/* Log Area */}
      <div className="bg-black/90 p-4 h-80 overflow-y-auto font-mono relative border-l border-r border-neon-900/50">
        {/* Scanline overlay specifically for terminal */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 bg-[length:100%_2px,3px_100%] bg-repeat"></div>
        
        <div className="relative z-10 space-y-2">
            {logs.map((log) => (
            <div key={log.id} className="flex items-start animate-fade-in">
                <span className="text-gray-600 mr-3 shrink-0 select-none">[{log.timestamp}]</span>
                <span className={`
                ${log.type === 'error' ? 'text-red-500' : ''}
                ${log.type === 'warning' ? 'text-yellow-400' : ''}
                ${log.type === 'success' ? 'text-neon-400' : ''}
                ${log.type === 'system' ? 'text-neon-700' : ''}
                ${log.type === 'info' ? 'text-gray-300' : ''}
                break-words
                `}>
                {log.type === 'system' ? '> ' : ''}{log.text}
                </span>
            </div>
            ))}
            {state !== GenerationState.IDLE && (
                <div className="text-neon-500 animate-pulse">
                    _ {state === GenerationState.ENCRYPTING ? 'Encrypting Payload' : 
                       state === GenerationState.PROCESSING_TEE ? 'Processing in Secure Enclave' :
                       'Decrypting Output'}...
                </div>
            )}
            <div ref={logsEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <form onSubmit={handleCommand} className="bg-cyber-panel p-3 border-t border-neon-900 rounded-b-lg flex items-center relative z-30">
        <span className="text-neon-500 mr-2">$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={state !== GenerationState.IDLE}
          className="bg-transparent text-neon-50 w-full focus:outline-none font-mono placeholder-gray-700"
          placeholder={state === GenerationState.IDLE ? "Enter prompt for secure inference..." : "Processing..."}
          autoFocus
        />
        <button 
            type="submit"
            disabled={state !== GenerationState.IDLE || !input.trim()}
            className="text-neon-500 hover:text-neon-400 disabled:text-gray-700 transition-colors"
        >
            <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};

export default Terminal;