import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface WebSocketMessage {
  type: 'create_session' | 'join_session' | 'message' | 'close' | 'ping' | 'pong' | 'authenticate' | 'challenge' | 'system';
  sessionId?: string;
  content?: string;
  timestamp?: string;
  walletAddress?: string;
  signature?: string;
  challenge?: string;
  nullifierHash?: string;
}

export interface SessionInfo {
  sessionId: string;
  modelId: string;
  status: 'connecting' | 'authenticating' | 'creating_session' | 'active' | 'closed' | 'error';
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'authenticating' | 'error';

export function useWebSocketChat() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const challengeRef = useRef<string | null>(null);

  // WebSocket URL - configurable
  const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

  // Generate unique message ID
  const generateMessageId = useCallback(() => {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }, []);

  // Add message to chat
  const addMessage = useCallback((type: 'user' | 'assistant' | 'system', content: string) => {
    const message: ChatMessage = {
      id: generateMessageId(),
      type,
      content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, message]);
  }, [generateMessageId]);

  // Send message via WebSocket
  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !sessionInfo) {
      setError('Not connected to chat session');
      return;
    }

    const message: WebSocketMessage = {
      type: 'message',
      sessionId: sessionInfo.sessionId,
      content: content.trim(),
      timestamp: new Date().toISOString()
    };

    wsRef.current.send(JSON.stringify(message));

    // Add user message to chat
    addMessage('user', content.trim());
  }, [sessionInfo, addMessage]);

  // Create new session
  const createSession = useCallback((modelId: string, nullifierHash?: string) => {
    console.log('createSession called with modelId:', modelId);
    console.log('Current wsRef.current:', wsRef.current);
    console.log('Current readyState:', wsRef.current?.readyState);
    console.log('WebSocket.OPEN constant:', WebSocket.OPEN);

    // Check if we have any WebSocket connection, even if state says otherwise
    if (!wsRef.current) {
      console.log('No WebSocket reference, cannot create session');
      setError('WebSocket not connected. Please click "Connect" first.');
      return;
    }

    // Double-check WebSocket is still open (defense in depth)
    if (wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not open during session creation, readyState:', wsRef.current.readyState);
      setError('WebSocket connection lost. Please click "Connect" again.');
      return;
    }

    if (!isConnected || !address) {
      console.error('No account available');
      setError('Wallet not connected');
      return;
    }

    // Generate session ID in format: {uuid}-{modelId}
    const sessionId = `${crypto.randomUUID()}-${modelId}`;
    console.log('Generated sessionId:', sessionId);

    const newSessionInfo = {
      sessionId,
      modelId,
      status: 'creating_session' as const  // Will become 'active' when server confirms both clients connected
    };

    console.log('Setting session info to:', newSessionInfo);
    setSessionInfo(newSessionInfo);

    const createSessionMessage: WebSocketMessage = {
      type: 'create_session',
      sessionId,
      nullifierHash
    };

    console.log('Sending createSession message:', createSessionMessage);
    try {
      wsRef.current.send(JSON.stringify(createSessionMessage));
      console.log('Sent createSession message successfully');
    } catch (error) {
      console.error('Failed to send createSession message:', error);
      setError('Failed to send session creation message');
      return;
    }

    // Add system message
    addMessage('system', `Creating chat session with model ${modelId}...`);
  }, [isConnected, address, addMessage]);

  // Close session
  const closeSession = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && sessionInfo) {
      const closeMessage: WebSocketMessage = {
        type: 'close',
        sessionId: sessionInfo.sessionId
      };

      wsRef.current.send(JSON.stringify(closeMessage));
    }

    setSessionInfo(null);
    addMessage('system', 'Chat session closed');
  }, [sessionInfo, addMessage]);

  // Handle WebSocket messages
  const handleMessage = useCallback(async (event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data.toString());

      switch (message.type) {
        case 'challenge':
          if (!message.challenge) {
            setError('Invalid authentication challenge');
            return;
          }

          setConnectionState('authenticating');
          challengeRef.current = message.challenge;

          // Sign the challenge
          try {
            const signature = await signMessageAsync({
              message: message.challenge
            });

            const authMessage: WebSocketMessage = {
              type: 'authenticate',
              walletAddress: address,
              signature: signature
            };

            wsRef.current?.send(JSON.stringify(authMessage));
          } catch (signError) {
            console.error('Failed to sign challenge:', signError);
            setError('Failed to sign authentication challenge');
            setConnectionState('error');
          }
          break;

        case 'system':
          if (message.content) {
            addMessage('system', message.content);

            // Update session status based on system messages
            if (message.content.includes('Authenticated')) {
              setConnectionState('connected');
            } else if (message.content.includes('Session active') || message.content.includes('Both clients connected')) {
              setSessionInfo(prev => prev ? { ...prev, status: 'active' } : null);
            } else if (message.content.includes('Session closed')) {
              setSessionInfo(prev => prev ? { ...prev, status: 'closed' } : null);
            }
          }
          break;

        case 'pong':
          // Heartbeat response, ignore
          break;

        case 'message':
          if (message.content) {
            // This is a message from the other participant (assistant)
            addMessage('assistant', message.content);
          }
          break;

        default:
          console.log('Unhandled message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      setError('Failed to parse server message');
    }
  }, [address, signMessageAsync, addMessage, sessionInfo]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Check if we already have a valid connection
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && connectionState === 'connected') {
      console.log('Already connected, skipping connection attempt');
      return;
    }

    // Close any existing connection first
    if (wsRef.current) {
      console.log('Closing existing WebSocket connection');
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState('connecting');
    setError(null);

    try {
      console.log('Creating new WebSocket connection to:', WS_URL);
      wsRef.current = new WebSocket(WS_URL);
      console.log('WebSocket object created, wsRef.current set');

      wsRef.current.onopen = () => {
        console.log('WebSocket connected, waiting for authentication challenge...');
        console.log('Current connectionState before update:', connectionState);
        setConnectionState('connecting'); // Keep as connecting until authenticated
        setError(null); // Clear any previous errors
        console.log('Connection state set to connecting (waiting for auth)');

        // Start heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Send ping every 30 seconds

        // Store heartbeat interval for cleanup
        (wsRef.current as any).heartbeat = heartbeat;
      };

      wsRef.current.onmessage = handleMessage;

      wsRef.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason, 'Setting wsRef.current to null');
        console.log('Previous wsRef.current:', wsRef.current);

        // Clear heartbeat
        if ((wsRef.current as any).heartbeat) {
          clearInterval((wsRef.current as any).heartbeat);
        }

        setConnectionState('disconnected');
        wsRef.current = null;
        console.log('wsRef.current set to null');

        if (sessionInfo && sessionInfo.status === 'active') {
          setSessionInfo(prev => prev ? { ...prev, status: 'closed' } : null);
          addMessage('system', 'Connection lost. Please reconnect.');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionState('error');
        setError('WebSocket connection failed');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionState('error');
      setError('Failed to connect to chat server');
    }
  }, [WS_URL, handleMessage, sessionInfo, addMessage]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState('disconnected');
    setSessionInfo(null);
  }, []);

  // Monitor wsRef changes
  useEffect(() => {
    console.log('wsRef.current changed:', wsRef.current);
  }, [wsRef.current]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      disconnect();
    };
  }, [disconnect]);

  return {
    // State
    connectionState,
    messages,
    sessionInfo,
    error,

    // Actions
    connect,
    disconnect,
    createSession,
    sendMessage,
    closeSession,

    // Utilities
    clearMessages: () => setMessages([]),
    clearError: () => setError(null)
  };
}
