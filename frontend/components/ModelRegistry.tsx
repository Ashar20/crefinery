'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { CyberConnectButton } from './CyberConnectButton';

interface ModelMetadata {
  name: string;
  company: string;
  parameters: string;
  goodAt: string;
  needsImprovement: string;
}

interface ModelResponse {
  id: string;
  metadata: ModelMetadata;
  uploaderAddress: string;
  createdAt: string;
  dockerfileHash: string;
  metadataHash: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function ModelRegistry() {
  const { address, isConnected } = useAccount();

  const [models, setModels] = useState<ModelResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [decryptingModels, setDecryptingModels] = useState<Set<string>>(new Set());
  const [decryptedDockerfiles, setDecryptedDockerfiles] = useState<Record<string, string>>({});
  const [deployingModels, setDeployingModels] = useState<Set<string>>(new Set());
  const [stoppingAll, setStoppingAll] = useState(false);
  const [trainingDataCounts, setTrainingDataCounts] = useState<Record<string, number>>({});
  const [loadingTrainingData, setLoadingTrainingData] = useState<Set<string>>(new Set());
  const [fineTuningModels, setFineTuningModels] = useState<Set<string>>(new Set());

  // Fetch models from backend
  const fetchModels = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/models`);
      if (response.ok) {
        const data = await response.json();
        console.log('Full API response:', data);
        // Handle both array and object with models property
        const modelsArray = Array.isArray(data) ? data : (data.models || []);
        console.log('Processed models array:', modelsArray);
        console.log('Models count:', modelsArray.length);
        setModels(modelsArray);
      } else {
        console.error('API response not ok:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const decryptDockerfile = async (modelId: string) => {
    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }

    setDecryptingModels(prev => new Set(prev).add(modelId));

    try {
      console.log(`Starting decryption for model ${modelId}...`);

      const response = await fetch(`${API_URL}/models/${modelId}/dockerfile?requester=${address}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const dockerfileContent = data.dockerfile;

      console.log('Backend decryption successful');
      console.log(`Decrypted content length: ${dockerfileContent.length} characters`);
      console.log(`Content preview: ${dockerfileContent.substring(0, 100).replace(/\n/g, '\\n')}...`);

      // Store the decrypted content
      setDecryptedDockerfiles(prev => ({
        ...prev,
        [modelId]: dockerfileContent
      }));

      console.log(`Model ${modelId} dockerfile decrypted and ready to view`);
    } catch (error) {
      console.error('Decryption failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to decrypt dockerfile: ${errorMessage}`);

      // Store error message as content
      setDecryptedDockerfiles(prev => ({
        ...prev,
        [modelId]: `Error: ${errorMessage}`
      }));
    } finally {
      setDecryptingModels(prev => {
        const newSet = new Set(prev);
        newSet.delete(modelId);
        return newSet;
      });
    }
  };

  // Deploy model dockerfile
  const deployModel = async (modelId: string) => {
    console.log('deployModel called with modelId:', modelId, 'type:', typeof modelId);

    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }

    if (!modelId || modelId === 'undefined') {
      alert('Error: Model ID is missing or invalid');
      console.error('deployModel called with invalid modelId:', modelId);
      return;
    }

    setDeployingModels(prev => new Set(prev).add(modelId));

    try {
      console.log(`Starting deployment for model ${modelId}...`);

      const response = await fetch(`${API_URL}/models/${modelId}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requester: address
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      console.log('Model deployment successful');
      alert(`Model deployed successfully! Container is running on port ${data.port}`);

    } catch (error) {
      console.error('Deployment failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to deploy model: ${errorMessage}`);
    } finally {
      setDeployingModels(prev => {
        const newSet = new Set(prev);
        newSet.delete(modelId);
        return newSet;
      });
    }
  };

  // Stop all containers
  const stopAllContainers = async () => {
    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }

    const confirmStop = window.confirm('Are you sure you want to stop all running containers? This action cannot be undone.');
    if (!confirmStop) return;

    setStoppingAll(true);

    try {
      console.log('Stopping all containers...');

      const response = await fetch(`${API_URL}/containers/stop-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      console.log('All containers stopped successfully');
      alert(`Successfully stopped ${data.stoppedContainers?.length || 0} containers`);

    } catch (error) {
      console.error('Stop all failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to stop containers: ${errorMessage}`);
    } finally {
      setStoppingAll(false);
    }
  };

  // Get training data count for model
  const getTrainingData = async (modelId: string) => {
    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }

    setLoadingTrainingData(prev => new Set(prev).add(modelId));

    try {
      console.log(`Getting training data count for model ${modelId}...`);

      const response = await fetch(`${API_URL}/models/${modelId}/training-data`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      const count = data.count || 0;

      console.log(`Training data count: ${count} sessions`);

      // Store the count
      setTrainingDataCounts(prev => ({
        ...prev,
        [modelId]: count
      }));

    } catch (error) {
      console.error('Failed to get training data:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to get training data: ${errorMessage}`);
    } finally {
      setLoadingTrainingData(prev => {
        const newSet = new Set(prev);
        newSet.delete(modelId);
        return newSet;
      });
    }
  };

  // Fine tune model - fetches training data from server, then calls the deployed container
  const fineTuneModel = async (modelId: string) => {
    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }

    if (!modelId || modelId === 'undefined') {
      alert('Error: Model ID is missing or invalid');
      return;
    }

    setFineTuningModels(prev => new Set(prev).add(modelId));

    try {
      console.log(`Starting fine-tuning for model ${modelId}...`);

      // Step 1: Check if model is deployed and get container port
      const deploymentRes = await fetch(`${API_URL}/models/${modelId}/deployment`);
      if (!deploymentRes.ok) {
        throw new Error('Model is not deployed. Deploy the model first before fine-tuning.');
      }
      const deploymentData = await deploymentRes.json();
      const containerPort = deploymentData.port;
      console.log(`Model deployed on port ${containerPort}`);

      // Step 2: Get training data CIDs from server
      const trainingRes = await fetch(`${API_URL}/models/${modelId}/training-data`);
      if (!trainingRes.ok) {
        throw new Error('Failed to fetch training data');
      }
      const trainingData = await trainingRes.json();
      const sessions = trainingData.trainingData || [];

      if (sessions.length === 0) {
        throw new Error('No training data available. Run CRE evaluation on chat sessions first.');
      }

      console.log(`Found ${sessions.length} training data sessions`);

      // Step 3: Fetch session content from IPFS for each CID
      const trainingExamples: { text: string }[] = [];
      for (const cid of sessions) {
        try {
          const ipfsRes = await fetch(`https://ipfs.io/ipfs/${cid}`);
          if (ipfsRes.ok) {
            const sessionData = await ipfsRes.json();
            const messages = sessionData.messages || [];
            // Convert session messages into training format
            for (let i = 0; i < messages.length - 1; i += 2) {
              const userMsg = messages[i];
              const assistantMsg = messages[i + 1];
              if (userMsg && assistantMsg) {
                const userText = userMsg.content || userMsg.text || '';
                const assistantText = assistantMsg.content || assistantMsg.text || '';
                if (userText && assistantText) {
                  trainingExamples.push({
                    text: `User: ${userText}\nAssistant: ${assistantText}`
                  });
                }
              }
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch session ${cid} from IPFS:`, err);
        }
      }

      if (trainingExamples.length === 0) {
        throw new Error('Could not extract training examples from session data');
      }

      console.log(`Prepared ${trainingExamples.length} training examples`);

      // Step 4: Send training data to the deployed container's /fine-tune endpoint
      const finetuneRes = await fetch(`http://localhost:${containerPort}/fine-tune`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: trainingExamples }),
      });

      if (!finetuneRes.ok) {
        const errorData = await finetuneRes.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `Fine-tune failed: HTTP ${finetuneRes.status}`);
      }

      const result = await finetuneRes.json();
      console.log('Fine-tuning complete:', result);
      alert(`Fine-tuning completed successfully! Model on port ${containerPort} is now updated.`);

    } catch (error) {
      console.error('Fine-tuning failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to fine-tune model: ${errorMessage}`);
    } finally {
      setFineTuningModels(prev => {
        const newSet = new Set(prev);
        newSet.delete(modelId);
        return newSet;
      });
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-neon-900/20 border border-neon-900 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-4 font-mono">
          AUTHENTICATION REQUIRED
        </h2>
        <p className="text-gray-400 font-mono text-sm mb-6">
          Please connect your wallet to register and manage AI models.
        </p>
        <CyberConnectButton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white font-mono">
          REGISTERED MODELS {models.length > 0 && `(${models.length})`}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={stopAllContainers}
            disabled={stoppingAll}
            className="px-4 py-2 bg-red-900/50 border border-red-500/50 text-red-400 font-mono text-xs hover:bg-red-900/70 hover:border-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
          >
            {stoppingAll ? 'STOPPING...' : 'END ALL'}
          </button>
          <button
            onClick={fetchModels}
            disabled={loading}
            className="px-4 py-2 bg-cyber-panel border border-neon-900 text-neon-400 font-mono text-xs hover:border-neon-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
          >
            {loading ? 'LOADING...' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mb-4 p-3 bg-cyber-dark border border-neon-900/50 rounded text-xs font-mono">
          <div className="text-neon-700 mb-2">DEBUG INFO</div>
          <div className="text-gray-400 space-y-1">
            <div>Models in state: <span className="text-neon-500">{models.length}</span></div>
            <div>Loading: <span className="text-neon-500">{loading ? 'Yes' : 'No'}</span></div>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-neon-700 hover:text-neon-500">Raw models data</summary>
            <pre className="mt-2 p-2 bg-black/50 border border-neon-900 overflow-auto max-h-40 text-neon-400">{JSON.stringify(models, null, 2)}</pre>
          </details>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-neon-500 border-t-transparent"></div>
          <p className="text-neon-500 mt-4 font-mono text-sm animate-pulse">LOADING MODELS...</p>
        </div>
      ) : models.length === 0 ? (
        <div className="text-center py-12 border border-neon-900/50 rounded-lg bg-cyber-panel/50">
          <p className="text-gray-400 font-mono text-sm">
            NO MODELS REGISTERED YET
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {models.map((model, index) => {
            // Validate model structure
            if (!model || !model.id) {
              console.warn(`Invalid model at index ${index}:`, model);
              return null;
            }
            console.log(`Rendering model ${index}:`, model);
            return (
              <div key={model.id || `model-${index}`} className="bg-cyber-panel border border-neon-900/50 rounded-lg p-6 neon-box-glow">
                {/* Model Header */}
                <div className="flex justify-between items-start mb-4 pb-4 border-b border-neon-900/50">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1 font-mono">
                      {model.metadata.name}
                    </h3>
                    <p className="text-neon-700 text-sm font-mono">
                      by {model.metadata.company}
                    </p>
                  </div>
                  <span className="text-xs text-neon-800 font-mono border border-neon-900 px-2 py-1">
                    {new Date(model.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Model Details */}
                <div className="space-y-2 mb-4">
                  {model.metadata.parameters && (
                    <div className="flex items-start">
                      <span className="text-xs font-mono text-neon-500 mr-3 min-w-[100px] uppercase tracking-wider">Parameters:</span>
                      <span className="text-sm text-gray-300 font-mono">{model.metadata.parameters}</span>
                    </div>
                  )}

                  {model.metadata.goodAt && (
                    <div className="flex items-start">
                      <span className="text-xs font-mono text-neon-500 mr-3 min-w-[100px] uppercase tracking-wider">Good at:</span>
                      <span className="text-sm text-gray-300 font-mono">{model.metadata.goodAt}</span>
                    </div>
                  )}

                  {model.metadata.needsImprovement && (
                    <div className="flex items-start">
                      <span className="text-xs font-mono text-neon-500 mr-3 min-w-[100px] uppercase tracking-wider">Needs improvement:</span>
                      <span className="text-sm text-gray-300 font-mono">{model.metadata.needsImprovement}</span>
                    </div>
                  )}

                  {trainingDataCounts[model.id] !== undefined && (
                    <div className="flex items-start">
                      <span className="text-xs font-mono text-neon-500 mr-3 min-w-[100px] uppercase tracking-wider">Training Data:</span>
                      <span className="text-sm text-gray-300 font-mono">{trainingDataCounts[model.id]} sessions</span>
                    </div>
                  )}
                </div>

                {/* Model Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-neon-900/50">
                  <div className="space-y-1">
                    <div className="text-xs text-neon-800 font-mono">
                      ID: {model.id}
                    </div>
                    <div className="text-xs text-neon-800 font-mono">
                      Owner: {model.uploaderAddress.slice(0, 6)}...{model.uploaderAddress.slice(-4)}
                    </div>
                  </div>
                  {isConnected && address && model.uploaderAddress === address && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => decryptDockerfile(model.id)}
                        disabled={decryptingModels.has(model.id)}
                        className="px-3 py-1.5 text-xs bg-blue-900/50 border border-blue-500/50 text-blue-400 font-mono hover:bg-blue-900/70 hover:border-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                      >
                        {decryptingModels.has(model.id) ? 'DECRYPTING...' : 'VIEW DOCKERFILE'}
                      </button>
                      <button
                        onClick={() => getTrainingData(model.id)}
                        disabled={loadingTrainingData.has(model.id)}
                        className="px-3 py-1.5 text-xs bg-purple-900/50 border border-purple-500/50 text-purple-400 font-mono hover:bg-purple-900/70 hover:border-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                      >
                        {loadingTrainingData.has(model.id) ? 'LOADING...' : 'GET DATA'}
                      </button>
                      <button
                        onClick={() => {
                          const currentModelId = model.id;
                          console.log('Deploy button clicked for model:', model);
                          console.log('Model ID:', currentModelId);
                          if (currentModelId && typeof currentModelId === 'string' && currentModelId !== 'undefined') {
                            deployModel(currentModelId);
                          } else {
                            alert('Error: Invalid model ID');
                            console.error('Model has invalid ID:', model, 'currentModelId:', currentModelId);
                          }
                        }}
                        disabled={deployingModels.has(model.id)}
                        className="px-3 py-1.5 text-xs bg-green-900/50 border border-green-500/50 text-green-400 font-mono hover:bg-green-900/70 hover:border-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                      >
                        {deployingModels.has(model.id) ? 'DEPLOYING...' : 'DEPLOY'}
                      </button>
                      <button
                        onClick={() => fineTuneModel(model.id)}
                        disabled={fineTuningModels.has(model.id)}
                        className="px-3 py-1.5 text-xs bg-orange-900/50 border border-orange-500/50 text-orange-400 font-mono hover:bg-orange-900/70 hover:border-orange-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                      >
                        {fineTuningModels.has(model.id) ? 'FINE-TUNING...' : 'FINE TUNE'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Display decrypted dockerfile */}
                {decryptedDockerfiles[model.id] && (
                  <div className="mt-4 p-4 bg-black/50 border border-neon-900/50 rounded">
                    <h4 className="text-sm font-bold text-white mb-2 font-mono uppercase tracking-wider">
                      DOCKERFILE CONTENT:
                    </h4>
                    <pre className="text-xs text-neon-400 whitespace-pre-wrap font-mono overflow-x-auto max-h-60 overflow-y-auto">
                      {decryptedDockerfiles[model.id]}
                    </pre>
                    <details className="mt-3">
                      <summary className="text-xs text-neon-700 cursor-pointer hover:text-neon-500 font-mono">
                        DEBUG INFO
                      </summary>
                      <div className="mt-2 p-3 bg-cyber-dark border border-neon-900/50 rounded text-xs font-mono space-y-1">
                        <div className="text-gray-400">Model ID: <span className="text-neon-500">{model.id}</span></div>
                        <div className="text-gray-400">Has Decrypted Content: <span className="text-neon-500">{decryptedDockerfiles[model.id] ? 'Yes' : 'No'}</span></div>
                        <div className="text-gray-400">Content Length: <span className="text-neon-500">{decryptedDockerfiles[model.id]?.length || 0}</span></div>
                        <div className="text-gray-400">Owner: <span className="text-neon-500">{model.uploaderAddress === address ? 'You' : 'Other'}</span></div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
