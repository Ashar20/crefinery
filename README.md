# PureSapiens

### Human-Verified AI Training Through Decentralized Consensus

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**PureSapiens** is a decentralized AI training platform that guarantees only human-generated data trains AI models. World ID verification ensures every training session originates from a real human. Chainlink CRE runs multi-stage session evaluation and proof generation across independent oracle nodes, eliminating single points of trust.

**Key Differentiators:**
- **Humans Only**: World ID verification gates all platform interactions — bots cannot contribute training data
- **Decentralized Evaluation**: Chainlink CRE evaluates sessions across multiple independent nodes, no single party decides what trains a model
- **On-Chain Proofs**: Every training operation produces a cryptographic proof verified and stored immutably on EVM
- **Nullifier Tracking**: Each training data entry is linked to a World ID nullifier hash, enabling per-session human verification audits

---

## The Problem

AI models are trained on data of unknown origin. There is no guarantee that training data comes from real humans rather than bots, scrapers, or synthetic generators. Centralized evaluation pipelines decide what data gets used with no transparency. Model providers claim training provenance but offer no verifiable proof.

---

## How PureSapiens Solves It

### World ID — Human Verification

Every user must pass World ID verification before interacting with the platform. The verification flow:

1. User connects EVM wallet and opens the chatbot or admin page
2. **VerificationGate** blocks access until World ID proof is completed
3. IDKit widget generates a zero-knowledge proof of personhood
4. Nullifier hash extracted and persisted per wallet address in localStorage
5. Nullifier hash travels with every session — stored alongside training data on-chain

This means every training session can be independently verified as originating from a unique human. The nullifier hash is a deterministic, privacy-preserving identifier — it proves humanness without revealing identity.

### Chainlink CRE — Decentralized Session Evaluation

Session evaluation runs as a multi-stage workflow on Chainlink CRE, distributed across independent oracle nodes:

**Stage 1: Session Evaluator** (runs on CRE nodes)
- Receives closed session data (CID from IPFS)
- AI-powered analysis scores session relevance against registered models
- Evaluates topic alignment, data quality, and training potential
- Produces structured evaluation result with relevance scores per model

**Stage 2: Proof Generator** (runs on CRE nodes)
- Receives evaluated session hashes and model assignments
- Generates ECDSA proof over the training data batch
- Submits proof to FinetuneProofRegistry smart contract on-chain
- Multiple nodes must reach consensus — no single node can fabricate proofs

Each stage runs independently on different CRE nodes. The workflow is defined in declarative YAML and deployed via the CRE CLI. No centralized backend decides what data trains which model.

### On-Chain Verification

Solidity smart contracts provide the trust layer:

- **ModelRegistry**: Model registration, metadata, and training data assignments
- **AccessControl**: Encryption policies and allowlist management
- **FinetuneProofRegistry**: Stores ECDSA proofs with timestamp validation (24-hour window), queryable by model ID

---

## Architecture

```
+------------------------------------------------------------------+
|                      HUMAN VERIFICATION                           |
|  World ID (IDKit) → Nullifier Hash → Stored per Wallet           |
|  VerificationGate blocks all access until proof passes            |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                      USER INTERACTION                             |
|  Frontend (Next.js) ←→ WebSocket ←→ Server ←→ AI Inference       |
|  Nullifier hash attached to every session                        |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                    STORAGE LAYER                                   |
|  * Session data → IPFS (Pinata)                                  |
|  * CID + nullifier hash stored with model training data          |
|  * AES-256-GCM encryption for sensitive payloads                 |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                 CRE EVALUATION LAYER                              |
|  Stage 1: Session Evaluator (multi-node consensus)               |
|    → AI relevance scoring against registered models              |
|  Stage 2: Proof Generator (multi-node consensus)                 |
|    → ECDSA proof generation + on-chain submission                |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                  ON-CHAIN VERIFICATION                            |
|  * ModelRegistry (model data + training assignments)             |
|  * FinetuneProofRegistry (ECDSA proofs, timestamp validation)    |
|  * AccessControl (allowlists, encryption policies)               |
|  * All proofs immutable and publicly queryable                   |
+------------------------------------------------------------------+
```

### Data Flow

1. **Verify** — User connects wallet, passes World ID verification, nullifier hash stored
2. **Chat** — User selects a model and chats via WebSocket. Session recorded with nullifier hash
3. **Store** — Session closes, data uploaded to IPFS via Pinata, CID recorded
4. **Evaluate** — CRE Session Evaluator workflow triggers across oracle nodes, scores session relevance per model
5. **Assign** — High-relevance sessions assigned to models as training data (CID + nullifier)
6. **Prove** — CRE Proof Generator creates ECDSA proof over training batch, submits to chain
7. **Audit** — Anyone can query on-chain proofs and verify each training session traces back to a World ID nullifier (a real human)

---

## Technology Stack

### Frontend
- **Next.js 16** (App Router) with React 19
- **wagmi + viem** (EVM wallet integration)
- **RainbowKit** (wallet UI)
- **World ID / IDKit** (human verification with nullifier tracking)
- **WebSocket client** for real-time chat

### Server
- **Node.js** with Express + WebSocket + TypeScript
- **ethers.js v6** (EVM contract interaction)
- **Pinata** (IPFS storage for session data)
- **AES-256-GCM** encryption

### Smart Contracts
- **Solidity 0.8.24** with Foundry
- **ModelRegistry** — model registration, training data assignments
- **AccessControl** — encryption policies, allowlists
- **FinetuneProofRegistry** — on-chain ECDSA proof storage with timestamp validation

### Chainlink CRE
- **Session Evaluator** — multi-node AI-powered session relevance scoring
- **Proof Generator** — multi-node ECDSA proof generation and on-chain submission
- Workflows defined in YAML, deployed via CRE CLI

### Storage
- **IPFS / Pinata** (session data)
- **EVM blockchain** (proofs, metadata, access control)

---

## Installation

### Prerequisites

- **Node.js 18+**
- **Foundry** (for smart contracts)
- **CRE CLI** (for Chainlink workflows)

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/philotheephilix/puresapiens.git
cd puresapiens

# 2. Install dependencies
cd server && npm install
cd ../frontend && npm install

# 3. Deploy smart contracts
cd ../contracts
forge install
forge build
forge script script/Deploy.s.sol --broadcast --rpc-url $EVM_RPC_URL

# 4. Configure environment
cd ../server
cp env.template .env
# Edit .env with contract addresses, RPC URL, Pinata keys

# 5. Configure frontend
cd ../frontend
cp .env.example .env.local
# Edit .env.local with World ID app ID, RP ID, signing key

# 6. Start server (REST API + WebSocket)
cd ../server && npm run dev &

# 7. Start frontend
cd ../frontend && npm run dev
```

**Access at:** http://localhost:3000

### CRE Workflow Deployment

```bash
# Deploy session evaluator
cd cre/session-evaluator
cre workflow deploy -T staging-settings

# Deploy proof generator
cd ../proof-generator
cre workflow deploy -T staging-settings
```

---

## Usage

### For Users

1. **Connect Wallet** — Visit `/chatbot`, connect your EVM wallet
2. **Verify Humanity** — Complete World ID verification (one-time per wallet)
3. **Chat** — Select a model and chat in real-time
4. **Automatic** — Your session is evaluated by CRE nodes and assigned to relevant models if high quality. Your nullifier hash proves it came from a real human

### For Model Providers

1. **Register Model** — Navigate to `/admin/register-model`, define model metadata and training focus areas
2. **View Training Data** — See auto-assigned sessions, each linked to a World ID nullifier
3. **Verify Proofs** — Query on-chain proofs via `GET /models/:id/proofs`
4. **Audit Humanness** — Verify training data nullifiers via `GET /models/:id/training-data/verify`

---

## API

### REST Endpoints

```
GET  /health                              - Health check
GET  /models                              - List all models
GET  /models/:id                          - Get model details
GET  /models/:id/training-data            - Get training sessions
GET  /models/:id/training-data/verify     - Verify human origin of training data
GET  /models/:id/proofs                   - Get on-chain fine-tuning proofs
POST /models                              - Register new model
PUT  /models/:id/training-data            - Add training data (with nullifierHash)
```

### WebSocket Protocol

```javascript
// Client → Server
{ type: 'authenticate', walletAddress: string, signature: string }
{ type: 'create_session', sessionId: string, nullifierHash: string }
{ type: 'message', sessionId: string, content: string }
{ type: 'close_session', sessionId: string }

// Server → Client
{ type: 'challenge', challenge: string }
{ type: 'system', content: string }
{ type: 'message', content: string, timestamp: string }
```

---

## Project Structure

```
puresapiens/
├── frontend/              # Next.js 16 UI (wagmi + RainbowKit + World ID)
│   ├── components/        # VerificationGate, CyberConnectButton
│   ├── contexts/          # WorldVerificationProvider
│   └── app/               # Pages (chatbot, admin, verify)
├── server/                # Unified Node.js server (Express + WebSocket)
│   └── src/               # Routes, services, WebSocket handler
├── contracts/             # Solidity smart contracts (Foundry)
│   ├── src/               # ModelRegistry, AccessControl, FinetuneProofRegistry
│   ├── test/              # Foundry tests
│   └── script/            # Deployment scripts
└── cre/                   # Chainlink CRE workflows
    ├── session-evaluator/ # Multi-node session relevance scoring
    └── proof-generator/   # Multi-node proof generation + on-chain submission
```

---

## Running Tests

```bash
# Smart contract tests
cd contracts && forge test

# Server tests
cd server && npm test
```

---

<div align="center">

**PureSapiens** — Humans Train AI. Proof On-Chain.

</div>
