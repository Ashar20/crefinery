import { Router } from 'express';
import fetch from 'node-fetch';

export function createTriggerRoutes(
    creSessionEvaluatorUrl: string,
    creProofGeneratorUrl: string
): Router {
    const router = Router();

    // POST /api/trigger/evaluate-session
    // Called internally after session close, or manually for testing
    router.post('/api/trigger/evaluate-session', async (req, res) => {
        try {
            const { cid, encryptionKey, iv, authTag, sessionId } = req.body;

            if (!cid || !sessionId) {
                return res.status(400).json({ error: 'cid and sessionId are required' });
            }

            if (!creSessionEvaluatorUrl) {
                return res.status(503).json({ error: 'CRE session evaluator URL not configured' });
            }

            await fetch(creSessionEvaluatorUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cid, encryptionKey, iv, authTag, sessionId }),
            });

            res.json({ status: 'triggered', sessionId });
        } catch (error) {
            console.error('Error triggering session evaluation:', error);
            res.status(500).json({ error: `Failed to trigger evaluation: ${error instanceof Error ? error.message : String(error)}` });
        }
    });

    // POST /api/trigger/generate-proof
    // Called by admin from frontend
    router.post('/api/trigger/generate-proof', async (req, res) => {
        try {
            const { modelId, sessionHashes, timestampMs } = req.body;

            if (!modelId || !sessionHashes || !timestampMs) {
                return res.status(400).json({ error: 'modelId, sessionHashes, and timestampMs are required' });
            }

            if (!creProofGeneratorUrl) {
                return res.status(503).json({ error: 'CRE proof generator URL not configured' });
            }

            await fetch(creProofGeneratorUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId, sessionHashes, timestampMs }),
            });

            res.json({ status: 'triggered', modelId });
        } catch (error) {
            console.error('Error triggering proof generation:', error);
            res.status(500).json({ error: `Failed to trigger proof generation: ${error instanceof Error ? error.message : String(error)}` });
        }
    });

    return router;
}
