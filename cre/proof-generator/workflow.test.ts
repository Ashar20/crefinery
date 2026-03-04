import { describe, expect } from 'bun:test'
import { cre, getNetwork, type HTTPPayload, TxStatus } from '@chainlink/cre-sdk'
import { EvmMock, newTestRuntime, test } from '@chainlink/cre-sdk/test'
import type { Address } from 'viem'
import {
	initWorkflow,
	onProofRequested,
	type ProofRequestPayload,
} from './workflow'

const CHAIN_SELECTOR = 16015286601757825753n // ethereum-testnet-sepolia
const MODEL_REGISTRY = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as Address
const PROOF_REGISTRY = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

const STAGING_CONFIG = {
	chainSelectorName: 'ethereum-testnet-sepolia',
	finetuneProofRegistryAddress: PROOF_REGISTRY,
	modelRegistryAddress: MODEL_REGISTRY,
	gasLimit: '500000',
}

describe('onProofRequested', () => {
	test('throws when payload is missing required fields', () => {
		const runtime = newTestRuntime() as any
		runtime.config = STAGING_CONFIG

		const payload: HTTPPayload = {
			input: new TextEncoder().encode(JSON.stringify({})),
		}
		expect(() =>
			onProofRequested(runtime, payload),
		).toThrow('Invalid payload')
	})

	test('throws when sessionHashes is empty', () => {
		const runtime = newTestRuntime() as any
		runtime.config = STAGING_CONFIG

		const payload: HTTPPayload = {
			input: new TextEncoder().encode(JSON.stringify({
				modelId: 'test-model',
				sessionHashes: [],
				timestampMs: Date.now(),
			})),
		}
		expect(() =>
			onProofRequested(runtime, payload),
		).toThrow('Invalid payload')
	})

	test('throws when modelId is empty string', () => {
		const runtime = newTestRuntime() as any
		runtime.config = STAGING_CONFIG

		const payload: HTTPPayload = {
			input: new TextEncoder().encode(JSON.stringify({
				modelId: '',
				sessionHashes: ['0x' + 'ab'.repeat(32)],
				timestampMs: Date.now(),
			})),
		}
		expect(() =>
			onProofRequested(runtime, payload),
		).toThrow('Invalid payload')
	})
})

describe('initWorkflow', () => {
	test('returns a single HTTP trigger handler', () => {
		const handlers = initWorkflow(STAGING_CONFIG)

		expect(handlers).toHaveLength(1)
		expect(handlers[0].fn).toBe(onProofRequested)
	})
})
