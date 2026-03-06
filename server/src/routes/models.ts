import { Router } from 'express';
import { ModelService } from '../services/ModelService';
import { EvmService } from '../services/EvmService';
import { EncryptionService } from '../services/EncryptionService';
import { ModelUploadRequest } from '../types';
import * as fs from 'fs';
import * as path from 'path';

interface ContainerInfo {
    modelId: string;
    containerName: string;
    port: number;
    createdAt: string;
}

const CONTAINER_REGISTRY_FILE = './container-registry.json';

async function loadContainerRegistry(): Promise<ContainerInfo[]> {
    try {
        const data = await fs.promises.readFile(CONTAINER_REGISTRY_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function saveContainerRegistry(containers: ContainerInfo[]): Promise<void> {
    await fs.promises.writeFile(CONTAINER_REGISTRY_FILE, JSON.stringify(containers, null, 2));
}

async function getNextAvailablePort(): Promise<number> {
    const containers = await loadContainerRegistry();
    const usedPorts = new Set(containers.map(c => c.port));
    let port = 8000;
    while (usedPorts.has(port)) {
        port++;
    }
    return port;
}

async function addContainer(modelId: string, containerName: string, port: number): Promise<void> {
    const containers = await loadContainerRegistry();
    const filtered = containers.filter(c => c.modelId !== modelId);
    filtered.push({ modelId, containerName, port, createdAt: new Date().toISOString() });
    await saveContainerRegistry(filtered);
}

export function createModelRoutes(
    modelService: ModelService,
    evmService: EvmService,
    encryptionService: EncryptionService
): Router {
    const router = Router();

    // GET /models
    router.get('/models', async (req, res) => {
        try {
            const models = await modelService.getModels();
            res.json({ models, count: models.length, timestamp: new Date().toISOString() });
        } catch (error) {
            console.error('Error in /models endpoint:', error);
            res.status(500).json({ error: 'Failed to retrieve models' });
        }
    });

    // GET /models/:id
    router.get('/models/:id', async (req, res) => {
        try {
            const model = await modelService.getModelById(req.params.id);
            if (!model) {
                return res.status(404).json({ error: 'Model not found' });
            }
            res.json({ model, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve model' });
        }
    });

    // GET /models/:id/training-data
    router.get('/models/:id/training-data', async (req, res) => {
        try {
            const model = await modelService.getModelById(req.params.id);
            if (!model) {
                return res.status(404).json({ error: 'Model not found' });
            }
            const trainingData = model.trainingData || [];
            res.json({ count: trainingData.length, trainingData, modelId: req.params.id, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve training data' });
        }
    });

    // GET /models/:id/deployment
    router.get('/models/:id/deployment', async (req, res) => {
        try {
            const { id } = req.params;
            const model = await modelService.getModelById(id);
            if (!model) {
                return res.status(404).json({ error: 'Model not found' });
            }

            const registry = await loadContainerRegistry();
            const container = registry.find(c => c.modelId === id);
            if (!container) {
                return res.status(404).json({ error: 'Model not deployed' });
            }

            res.json({
                modelId: id,
                port: container.port,
                containerName: container.containerName,
                status: 'running',
                createdAt: container.createdAt,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve deployment info' });
        }
    });

    // GET /models/:id/dockerfile
    router.get('/models/:id/dockerfile', async (req, res) => {
        try {
            const { requester } = req.query;
            if (!requester || typeof requester !== 'string') {
                return res.status(400).json({ error: 'requester address required' });
            }
            const dockerfile = await modelService.getModelDockerfile(req.params.id, requester);
            res.json({ dockerfile, modelId: req.params.id, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve dockerfile' });
        }
    });

    // GET /models/:id/encrypted
    router.get('/models/:id/encrypted', async (req, res) => {
        try {
            const { requester } = req.query;
            if (!requester || typeof requester !== 'string') {
                return res.status(400).json({ error: 'requester address required' });
            }
            const encryptedData = await modelService.getEncryptedModelData(req.params.id, requester);
            res.json({ encryptedData, modelId: req.params.id, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve encrypted dockerfile data' });
        }
    });

    // POST /models
    router.post('/models', async (req, res) => {
        try {
            const { metadata, uploaderAddress } = req.body;
            if (!metadata || !uploaderAddress) {
                return res.status(400).json({ error: 'metadata and uploaderAddress required' });
            }

            const dockerfileContent = req.body.dockerfile;
            if (!dockerfileContent) {
                return res.status(400).json({ error: 'dockerfile required (provide base64 string)' });
            }

            const uploadRequest: ModelUploadRequest = {
                dockerfile: dockerfileContent,
                metadata,
                uploaderAddress,
                files: req.body.files
            };

            const modelResponse = await modelService.uploadModel(uploadRequest);
            res.status(201).json({ success: true, model: modelResponse, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: 'Failed to upload model' });
        }
    });

    // PUT /models/:id/allowlist
    router.put('/models/:id/allowlist', async (req, res) => {
        try {
            const { serverAddresses } = req.body;
            if (!Array.isArray(serverAddresses)) {
                return res.status(400).json({ error: 'serverAddresses must be an array' });
            }
            await modelService.updateAllowlist(req.params.id, serverAddresses);
            res.json({ success: true, modelId: req.params.id, allowlist: serverAddresses, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update allowlist' });
        }
    });

    // PUT /models/:id/training-data
    router.put('/models/:id/training-data', async (req, res) => {
        try {
            const { sessionHash, nullifierHash } = req.body;
            if (!sessionHash || typeof sessionHash !== 'string') {
                return res.status(400).json({ error: 'sessionHash is required and must be a string' });
            }
            await modelService.addTrainingData(req.params.id, sessionHash, nullifierHash);
            res.json({ success: true, modelId: req.params.id, sessionHash, nullifierHash: nullifierHash || null, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: 'Failed to add training data' });
        }
    });

    // POST /models/:id/deploy
    router.post('/models/:id/deploy', async (req, res) => {
        try {
            const { id } = req.params;
            const { requester } = req.body;

            if (!id || id === 'undefined') {
                return res.status(400).json({ error: 'Invalid model ID' });
            }
            if (!requester || typeof requester !== 'string') {
                return res.status(400).json({ error: 'requester address required' });
            }

            let dockerfileContent = await modelService.getModelDockerfile(id, requester);
            if (!dockerfileContent) {
                return res.status(404).json({ error: 'Dockerfile not found or access denied' });
            }

            const modelDir = `/tmp/puresapiens-model-${id}`;
            const dockerfilePath = `${modelDir}/Dockerfile`;

            const { exec } = require('child_process');
            await new Promise<void>((resolve, reject) => {
                exec(`mkdir -p ${modelDir}`, (error: any) => {
                    if (error) reject(error);
                    else resolve();
                });
            });

            // Write companion files (app.py, requirements.txt, etc.) if provided
            const files = modelService.getModelFiles(id);
            console.log(`[Deploy] Model ${id}: companion files = ${files ? Object.keys(files).join(', ') : 'none'}`);
            if (files) {
                for (const [filename, base64Content] of Object.entries(files)) {
                    const filePath = `${modelDir}/${filename}`;
                    const content = Buffer.from(base64Content, 'base64').toString('utf-8');
                    await fs.promises.writeFile(filePath, content);
                    console.log(`[Deploy] Wrote companion file: ${filePath} (${content.length} bytes)`);
                }

                // Patch Dockerfile: replace inline RUN heredoc/echo blocks with COPY for companion files
                let patchedDockerfile = dockerfileContent;
                for (const filename of Object.keys(files)) {
                    // Remove "RUN cat > <filename> << 'EOF' ... EOF" blocks
                    const heredocPattern = new RegExp(
                        `RUN cat > ${filename.replace('.', '\\.')} << 'EOF'[\\s\\S]*?^EOF$`,
                        'm'
                    );
                    if (heredocPattern.test(patchedDockerfile)) {
                        patchedDockerfile = patchedDockerfile.replace(heredocPattern, `COPY ${filename} .`);
                        console.log(`[Deploy] Patched Dockerfile: replaced heredoc for ${filename} with COPY`);
                    }

                    // Remove "RUN echo ... > <filename> && echo ... >> <filename>" blocks
                    const echoPattern = new RegExp(
                        `RUN echo [^\\n]*> ${filename.replace('.', '\\.')}[\\s\\S]*?(?=\\n(?:RUN|COPY|EXPOSE|CMD|HEALTHCHECK|FROM|ENV|WORKDIR|#|$))`,
                        ''
                    );
                    if (echoPattern.test(patchedDockerfile)) {
                        patchedDockerfile = patchedDockerfile.replace(echoPattern, `COPY ${filename} .`);
                        console.log(`[Deploy] Patched Dockerfile: replaced echo block for ${filename} with COPY`);
                    }
                }
                dockerfileContent = patchedDockerfile;
            }

            await fs.promises.writeFile(dockerfilePath, dockerfileContent);

            const containerName = `puresapiens-model-${id}`;
            const imageName = `puresapiens-model-${id}:latest`;

            await new Promise<void>((resolve, reject) => {
                exec(`cd ${modelDir} && docker build -t ${imageName} .`, (error: any, _stdout: string, stderr: string) => {
                    if (error) reject(new Error(`Docker build failed: ${stderr}`));
                    else resolve();
                });
            });

            const port = await getNextAvailablePort();

            await new Promise<void>((resolve) => {
                exec(`docker stop ${containerName} && docker rm ${containerName}`, () => resolve());
            });

            await new Promise<void>((resolve, reject) => {
                exec(`docker run -d --name ${containerName} -p ${port}:8000 ${imageName}`, (error: any, _stdout: string, stderr: string) => {
                    if (error) reject(new Error(`Docker run failed: ${stderr}`));
                    else resolve();
                });
            });

            await addContainer(id, containerName, port);

            res.json({
                success: true,
                modelId: id,
                containerName,
                port,
                message: 'Model deployed successfully',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: `Failed to deploy model: ${error instanceof Error ? error.message : String(error)}` });
        }
    });

    // GET /models/:id/training-data/verify - Check which training data has human verification
    router.get('/models/:id/training-data/verify', async (req, res) => {
        try {
            const model = await modelService.getModelById(req.params.id);
            if (!model) {
                return res.status(404).json({ error: 'Model not found' });
            }
            const verification = modelService.getTrainingDataVerification(req.params.id);
            res.json({
                modelId: req.params.id,
                ...verification,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve training data verification' });
        }
    });

    // GET /models/:id/proofs
    router.get('/models/:id/proofs', async (req, res) => {
        try {
            const proofs = await evmService.getFineTuneProofs(req.params.id);
            res.json({ modelId: req.params.id, proofs, count: proofs.length, timestamp: new Date().toISOString() });
        } catch (error) {
            res.status(500).json({ error: `Failed to retrieve proofs: ${error instanceof Error ? error.message : String(error)}` });
        }
    });

    // POST /containers/stop-all
    router.post('/containers/stop-all', async (req, res) => {
        try {
            const containers = await loadContainerRegistry();
            if (containers.length === 0) {
                return res.json({ success: true, message: 'No containers to stop', stoppedContainers: [], timestamp: new Date().toISOString() });
            }

            const stoppedContainers: string[] = [];
            const { exec } = require('child_process');

            for (const container of containers) {
                await new Promise<void>((resolve) => {
                    exec(`docker stop ${container.containerName} && docker rm ${container.containerName}`, (error: any) => {
                        if (!error) stoppedContainers.push(container.containerName);
                        resolve();
                    });
                });
            }

            await saveContainerRegistry([]);
            res.json({
                success: true,
                message: `Stopped ${stoppedContainers.length} containers`,
                stoppedContainers,
                totalContainers: containers.length,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to stop containers' });
        }
    });

    return router;
}
