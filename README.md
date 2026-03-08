# PureSapiens

### Human-Verified AI Training Through Decentralized Consensus

**PureSapiens** is a decentralized AI training platform where **Chainlink CRE (Compute Runtime Environment)** orchestrates multi-stage session evaluation and proof generation across independent oracle nodes, while **World ID** ensures every piece of training data originates from a verified human. Together, they create the first trustless, human-only AI training pipeline.

---

## The Problem

AI models are trained on data of unknown origin. There is no guarantee that training data comes from real humans rather than bots, scrapers, or synthetic generators. Centralized evaluation pipelines decide what data gets used with no transparency. Model providers claim training provenance but offer no verifiable proof.

---

## How PureSapiens Solves It

### Chainlink CRE — The Core Engine

CRE is the backbone of PureSapiens. Every training data decision is made by a **decentralized network of oracle nodes** running deterministic workflows — no centralized backend, no single point of trust.

PureSapiens implements a **two-stage CRE pipeline**:

#### Stage 1: Session Evaluator (`cre/session-evaluator`)

When a chat session closes, the CRE Session Evaluator workflow triggers across multiple independent oracle nodes:

1. **Consensus Fetch** — All CRE nodes independently fetch the encrypted session from IPFS. The `identical` aggregation function ensures every node works with the exact same data
2. **Decrypt & Redact** — Each node decrypts the session (AES-256-GCM) and strips PII (emails, phones, card numbers, IDs)
3. **AI Evaluation** — Using `ConfidentialHTTPClient` (secrets never leave the CRE enclave), each node calls OpenAI to summarize the session and score its relevance (0-100) against registered models
4. **On-Chain Assignment** — If the relevance score exceeds the threshold (default: 70), the CRE DON reaches consensus and calls `TrainingDataManager.assignTrainingData()` on-chain via `EVMClient`

```
CRE Node A ─┐
CRE Node B ──┤── Consensus ──→ assignTrainingData(modelId, cid, score)
CRE Node C ─┘
```

No single node decides what data trains a model. The DON must agree.

#### Stage 2: Proof Generator (`cre/proof-generator`)

Once training data is assigned, the CRE Proof Generator creates cryptographic proof:

1. **Model Verification** — CRE nodes call `ModelRegistry.getModel()` to verify the target model exists
2. **Proof Hash** — Compute `keccak256(abi.encodePacked(modelId, timestampMs, sessionHashes[]))`
3. **DON Consensus Report** — `runtime.report()` triggers multi-node threshold signing. Multiple independent nodes must agree on and sign the `storeProof` transaction
4. **On-Chain Submission** — `EVMClient.writeReport()` submits the consensus-signed transaction to `FinetuneProofRegistry`

```
CRE Node A signs ─┐
CRE Node B signs ──┤── Threshold Signature ──→ storeProof(modelId, timestamp, hashes, signature)
CRE Node C signs ─┘
```

The proof is **immutable and publicly queryable**. Anyone can verify that training was properly evaluated by a decentralized network.

#### Why CRE Matters Here

| Without CRE | With CRE |
|---|---|
| Single server decides what data trains models | Multiple independent nodes must reach consensus |
| Proofs signed by one key (forgeable) | Threshold signatures require DON agreement |
| API keys exposed in backend code | `ConfidentialHTTPClient` keeps secrets in CRE enclave |
| Training assignments can be manipulated | On-chain transactions require multi-node consensus |
| No verifiable computation | Deterministic workflows, auditable on-chain |

#### CRE Capabilities Used

- **`HTTPClient`** — Consensus-based IPFS fetches (all nodes must see the same data)
- **`ConfidentialHTTPClient`** — Secure API calls with secrets that never leave CRE enclaves
- **`EVMClient`** — On-chain contract calls with DON consensus signing
- **`CronCapability`** — Scheduled workflow triggers
- **Consensus Aggregation** — `identical` mode ensures all nodes agree on intermediate results
- **`runtime.report()`** — Threshold signature generation for on-chain proof submission

### World ID — Human Verification Gate

World ID provides the Sybil-resistance layer. Every user must prove they are human before any interaction:

1. User connects EVM wallet and hits a **VerificationGate**
2. IDKit widget generates a **zero-knowledge proof** of personhood on the user's device
3. Proof verified against World ID v4 API — no personal data transmitted
4. A **nullifier hash** (unique, deterministic, privacy-preserving) is extracted and stored per wallet
5. The nullifier hash travels with every session into the CRE pipeline and is recorded on-chain alongside training data

This means every training session can be independently verified as originating from a unique human — without revealing who that human is.

### World ID + CRE: The Combined Effect

The combination creates a closed loop of trust:

```
Human (World ID) → Nullifier Hash → Chat Session → IPFS
     ↓
CRE Session Evaluator (multi-node consensus)
     ↓ score >= 70
TrainingDataManager.assignTrainingData(modelId, cid, score) ← on-chain
     ↓
CRE Proof Generator (DON threshold signing)
     ↓
FinetuneProofRegistry.storeProof(modelId, timestamp, hashes, signature) ← on-chain
     ↓
Anyone can audit: proof → session hashes → CIDs → nullifier hashes → verified humans
```

- **World ID** guarantees the data source is human
- **CRE** guarantees the evaluation is decentralized and untampered
- **On-chain proofs** guarantee the record is immutable and publicly verifiable

No bots. No centralized gatekeepers. No trust assumptions.

---

## Architecture

```
+------------------------------------------------------------------+
|                      HUMAN VERIFICATION                           |
|  World ID (IDKit) -> Nullifier Hash -> Stored per Wallet          |
|  VerificationGate blocks all access until proof passes            |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                      USER INTERACTION                             |
|  Frontend (Next.js) <-> WebSocket <-> Server <-> AI Inference     |
|  Nullifier hash attached to every session                        |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                    STORAGE LAYER                                   |
|  * Session data -> IPFS (Pinata)                                  |
|  * CID + nullifier hash stored with model training data          |
|  * AES-256-GCM encryption for sensitive payloads                 |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                 CRE EVALUATION LAYER                              |
|  Stage 1: Session Evaluator (multi-node consensus)               |
|    -> Fetch from IPFS, decrypt, redact PII, score relevance      |
|    -> DON consensus on TrainingDataManager.assignTrainingData()   |
|  Stage 2: Proof Generator (multi-node consensus)                 |
|    -> Verify model, compute proof hash, DON threshold signing    |
|    -> Submit storeProof() via EVMClient.writeReport()            |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                  ON-CHAIN VERIFICATION                            |
|  * ModelRegistry (model data + training assignments)             |
|  * TrainingDataManager (CRE-assigned training sessions)          |
|  * FinetuneProofRegistry (ECDSA proofs, timestamp validation)    |
|  * AccessControl (allowlists, encryption policies)               |
|  * All proofs immutable and publicly queryable                   |
+------------------------------------------------------------------+
```

### Data Flow

1. **Verify** — User connects wallet, passes World ID verification, nullifier hash stored
2. **Chat** — User selects a model and chats via WebSocket. Session recorded with nullifier hash
3. **Store** — Session closes, encrypted with AES-256-GCM, uploaded to IPFS via Pinata
4. **Evaluate (CRE)** — Session Evaluator workflow triggers across oracle nodes. Nodes fetch, decrypt, redact PII, summarize, and score relevance. DON consensus assigns high-quality sessions to models on-chain
5. **Prove (CRE)** — Proof Generator creates ECDSA proof over training batch via DON threshold signing, submits to `FinetuneProofRegistry`
6. **Audit** — Anyone queries on-chain proofs and traces each training session back to a World ID nullifier (a verified human)

---

## Smart Contracts

| Contract | Purpose |
|---|---|
| **ModelRegistry** | Register AI models with metadata, Dockerfile hashes, and server allowlists |
| **TrainingDataManager** | Store CRE-assigned training data (CID + score) per model. Only CRE forwarder or owner can write |
| **FinetuneProofRegistry** | Store ECDSA proofs with 24-hour timestamp validation. Verify signatures recover to CRE DON signer |
| **AccessControl** | Fine-grained encryption policies for model data access |

---

## Technology Stack

| Layer | Tech |
|---|---|
| **CRE Workflows** | Chainlink CRE SDK, TypeScript, viem, zod, consensus aggregation |
| **Frontend** | Next.js 16, React 19, wagmi, viem, RainbowKit, World ID IDKit |
| **Server** | Node.js, Express, WebSocket (ws), ethers.js v6, Pinata IPFS |
| **Contracts** | Solidity 0.8.24, Foundry, OpenZeppelin (Ownable, ECDSA) |
| **Storage** | IPFS (Pinata), EVM blockchain (Sepolia / Mainnet) |

---

## Project Structure

```
crefinery/
├── cre/                       # Chainlink CRE workflows (core engine)
│   ├── project.yaml           # CRE project config (RPCs, chains)
│   ├── session-evaluator/     # Stage 1: Multi-node session scoring
│   │   ├── workflow.ts        # Fetch → Decrypt → Redact → Score → Assign
│   │   ├── workflow.yaml      # CRE workflow definition
│   │   └── config.staging.json
│   ├── proof-generator/       # Stage 2: Multi-node proof generation
│   │   ├── workflow.ts        # Verify → Hash → DON Report → Submit
│   │   ├── workflow.yaml
│   │   └── config.staging.json
│   ├── my-workflow/           # General-purpose CRE workflow
│   └── contracts/             # ABI bindings for CRE ↔ EVM interaction
├── contracts/                 # Solidity smart contracts (Foundry)
│   ├── src/                   # ModelRegistry, AccessControl, FinetuneProofRegistry, TrainingDataManager
│   ├── test/                  # Foundry tests
│   └── script/                # Deployment scripts
├── frontend/                  # Next.js 16 UI
│   ├── components/            # VerificationGate, Terminal, MatrixRain
│   ├── contexts/              # WorldVerificationProvider
│   ├── hooks/                 # useWebSocketChat
│   └── app/                   # Pages (chatbot, admin, verify)
└── server/                    # Node.js backend
    └── src/
        ├── routes/            # REST API (models, triggers, local-cre)
        ├── services/          # EVM, Encryption, Session, Model, Pinata, Wallet
        └── ws/                # WebSocket server
```

---

## Quick Start

```bash
# Clone
git clone https://github.com/Ashar20/crefinery.git
cd crefinery

# Deploy smart contracts
cd contracts && forge install && forge build
forge script script/Deploy.s.sol --broadcast --rpc-url $RPC_URL

# Start server
cd ../server && npm install && npm run dev

# Start frontend
cd ../frontend && npm install && npm run dev

# Deploy CRE workflows
cd ../cre/session-evaluator && cre workflow deploy -T staging-settings
cd ../proof-generator && cre workflow deploy -T staging-settings
```

---

## Usage

### For Users
1. Connect wallet at `/chatbot`
2. Complete World ID verification (one-time per wallet)
3. Chat with AI models in real-time
4. Sessions are automatically evaluated by CRE nodes and assigned to relevant models

### For Model Providers
1. Register model at `/admin/register-model`
2. View auto-assigned training data (each linked to a World ID nullifier)
3. Trigger proof generation — CRE DON creates on-chain cryptographic proof
4. Share proof IDs for public auditability

---

## Tests

```bash
cd contracts && forge test      # Smart contract tests
cd cre/session-evaluator && npm test  # CRE workflow tests
cd cre/proof-generator && npm test
```

---

<div align="center">

**PureSapiens** — Humans Train AI. CRE Verifies. Proof On-Chain.

</div>
