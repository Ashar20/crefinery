'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

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
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [companionFiles, setCompanionFiles] = useState<File[]>([]);
  const [decryptingModels, setDecryptingModels] = useState<Set<string>>(new Set());
  const [decryptedDockerfiles, setDecryptedDockerfiles] = useState<Record<string, string>>({});
  const [deployingModels, setDeployingModels] = useState<Set<string>>(new Set());
  const [stoppingAll, setStoppingAll] = useState(false);
  const [trainingDataCounts, setTrainingDataCounts] = useState<Record<string, number>>({});
  const [loadingTrainingData, setLoadingTrainingData] = useState<Set<string>>(new Set());
  const [fineTuningModels, setFineTuningModels] = useState<Set<string>>(new Set());

  // Form state
  const [formData, setFormData] = useState<ModelMetadata>({
    name: '',
    company: '',
    parameters: '',
    goodAt: '',
    needsImprovement: ''
  });

  // Fetch models from backend
  const fetchModels = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/models`);
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched models:', data.models);
        setModels(data.models || []);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle Dockerfile selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // Handle companion files (app.py, requirements.txt, etc.)
  const handleCompanionFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setCompanionFiles(Array.from(files));
    }
  };

  // Handle form input changes
  const handleInputChange = (field: keyof ModelMetadata, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Upload model to backend
  const uploadModel = async () => {
    if (!selectedFile || !isConnected || !address) {
      alert('Please connect wallet and select a Dockerfile');
      return;
    }

    // Validate form
    if (!formData.name || !formData.company) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setUploading(true);

      // Convert Dockerfile to base64 (Unicode-safe)
      const fileContent = await selectedFile.text();
      const base64Content = btoa(unescape(encodeURIComponent(fileContent)));

      // Convert companion files to base64
      const filesMap: Record<string, string> = {};
      for (const file of companionFiles) {
        const content = await file.text();
        filesMap[file.name] = btoa(unescape(encodeURIComponent(content)));
      }

      // Prepare upload data
      const uploadData: Record<string, unknown> = {
        dockerfile: base64Content,
        metadata: formData,
        uploaderAddress: address,
      };
      if (Object.keys(filesMap).length > 0) {
        uploadData.files = filesMap;
      }

      // Upload to backend
      const response = await fetch(`${API_URL}/models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(uploadData)
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      alert(`Model uploaded successfully! ID: ${result.model.id}`);

      // Reset form
      setFormData({
        name: '',
        company: '',
        parameters: '',
        goodAt: '',
        needsImprovement: ''
      });
      setSelectedFile(null);
      setCompanionFiles([]);

      // Refresh models list
      fetchModels();

    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  if (!isConnected) {
    return null; // Handled by parent component
  }

  return (
    <div className="space-y-6">
      {/* Model Registration Form */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* File Upload */}
          <div>
            <label className="block text-xs font-mono text-neon-500 mb-2 tracking-wider uppercase">
              Dockerfile *
            </label>
            <div className="relative">
            <input
              type="file"
              accept="*"
              onChange={handleFileChange}
                className="w-full px-3 py-2 bg-black/50 border border-neon-900 text-neon-400 font-mono text-sm focus:outline-none focus:border-neon-500 transition-colors file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:font-mono file:bg-neon-900 file:text-neon-500 file:cursor-pointer hover:file:bg-neon-800"
            />
            {selectedFile && (
                <p className="text-xs text-neon-400 mt-2 font-mono">
                  Selected: {selectedFile.name}
              </p>
            )}
            </div>
          </div>

          {/* Companion Files */}
          <div>
            <label className="block text-xs font-mono text-neon-500 mb-2 tracking-wider uppercase">
              Companion Files (app.py, requirements.txt, etc.)
            </label>
            <div className="relative">
              <input
                type="file"
                multiple
                onChange={handleCompanionFiles}
                className="w-full px-3 py-2 bg-black/50 border border-neon-900 text-neon-400 font-mono text-sm focus:outline-none focus:border-neon-500 transition-colors file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:font-mono file:bg-neon-900 file:text-neon-500 file:cursor-pointer hover:file:bg-neon-800"
              />
              {companionFiles.length > 0 && (
                <p className="text-xs text-neon-400 mt-2 font-mono">
                  {companionFiles.length} file(s): {companionFiles.map(f => f.name).join(', ')}
                </p>
              )}
            </div>
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-xs font-mono text-neon-500 mb-2 tracking-wider uppercase">
              Model Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full px-3 py-2 bg-black/50 border border-neon-900 text-neon-50 font-mono text-sm focus:outline-none focus:border-neon-500 transition-colors placeholder:text-gray-700"
              placeholder="e.g., GPT-4 Variant"
            />
          </div>

          {/* Company */}
          <div>
            <label className="block text-xs font-mono text-neon-500 mb-2 tracking-wider uppercase">
              Company *
            </label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => handleInputChange('company', e.target.value)}
              className="w-full px-3 py-2 bg-black/50 border border-neon-900 text-neon-50 font-mono text-sm focus:outline-none focus:border-neon-500 transition-colors placeholder:text-gray-700"
              placeholder="e.g., OpenAI"
            />
          </div>

          {/* Parameters */}
          <div>
            <label className="block text-xs font-mono text-neon-500 mb-2 tracking-wider uppercase">
              Parameters
            </label>
            <input
              type="text"
              value={formData.parameters}
              onChange={(e) => handleInputChange('parameters', e.target.value)}
              className="w-full px-3 py-2 bg-black/50 border border-neon-900 text-neon-50 font-mono text-sm focus:outline-none focus:border-neon-500 transition-colors placeholder:text-gray-700"
              placeholder="e.g., 175B parameters"
            />
          </div>

          {/* Good At */}
          <div className="md:col-span-2">
            <label className="block text-xs font-mono text-neon-500 mb-2 tracking-wider uppercase">
              Good At
            </label>
            <textarea
              value={formData.goodAt}
              onChange={(e) => handleInputChange('goodAt', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-black/50 border border-neon-900 text-neon-50 font-mono text-sm focus:outline-none focus:border-neon-500 transition-colors placeholder:text-gray-700 resize-none"
              placeholder="Describe what this model excels at..."
            />
          </div>

          {/* Needs Improvement */}
          <div className="md:col-span-2">
            <label className="block text-xs font-mono text-neon-500 mb-2 tracking-wider uppercase">
              Needs Improvement
            </label>
            <textarea
              value={formData.needsImprovement}
              onChange={(e) => handleInputChange('needsImprovement', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-black/50 border border-neon-900 text-neon-50 font-mono text-sm focus:outline-none focus:border-neon-500 transition-colors placeholder:text-gray-700 resize-none"
              placeholder="Areas where this model could be improved..."
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-neon-900/50">
          <button
            onClick={uploadModel}
            disabled={uploading || !selectedFile || !formData.name || !formData.company}
            className="bg-neon-500 text-black px-8 py-3 font-bold font-mono text-sm hover:bg-neon-400 transition-all hover:scale-105 shadow-[0_0_20px_rgba(0,255,65,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none uppercase tracking-wider"
          >
            {uploading ? 'UPLOADING...' : 'REGISTER MODEL'}
          </button>
        </div>
      </div>
    </div>
  );
}
