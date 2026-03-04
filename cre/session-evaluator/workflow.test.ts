import { describe, expect } from 'bun:test'
import { cre, getNetwork } from '@chainlink/cre-sdk'
import { newTestRuntime, test } from '@chainlink/cre-sdk/test'
import { encodeFunctionData } from 'viem'
import {
	configSchema,
	initWorkflow,
	ModelRegistryABI,
	onSessionClosed,
	TrainingDataManagerABI,
} from './workflow'

const CHAIN_SELECTOR_NAME = 'ethereum-testnet-sepolia'
const MODEL_REGISTRY_ADDRESS = '0x694AA1769357215DE4FAC081bf1f309aDC325306'
const TRAINING_DATA_MANAGER_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

const stagingConfig = {
	pinataGatewayUrl: 'https://gateway.pinata.cloud',
	openaiModel: 'gpt-4o-mini',
	scoreThreshold: 70,
	chainSelectorName: CHAIN_SELECTOR_NAME,
	trainingDataManagerAddress: TRAINING_DATA_MANAGER_ADDRESS,
	modelRegistryAddress: MODEL_REGISTRY_ADDRESS,
	gasLimit: '1000000',
}

describe('configSchema', () => {
	test('parses valid config', () => {
		const parsed = configSchema.parse(stagingConfig)
		expect(parsed.pinataGatewayUrl).toBe('https://gateway.pinata.cloud')
		expect(parsed.openaiModel).toBe('gpt-4o-mini')
		expect(parsed.scoreThreshold).toBe(70)
		expect(parsed.chainSelectorName).toBe(CHAIN_SELECTOR_NAME)
	})

	test('applies defaults for openaiModel and scoreThreshold', () => {
		const minimal = {
			pinataGatewayUrl: 'https://example.com',
			chainSelectorName: CHAIN_SELECTOR_NAME,
			trainingDataManagerAddress: TRAINING_DATA_MANAGER_ADDRESS,
			modelRegistryAddress: MODEL_REGISTRY_ADDRESS,
			gasLimit: '500000',
		}
		const parsed = configSchema.parse(minimal)
		expect(parsed.openaiModel).toBe('gpt-4o-mini')
		expect(parsed.scoreThreshold).toBe(70)
	})

	test('rejects config missing required fields', () => {
		expect(() => configSchema.parse({})).toThrow()
		expect(() => configSchema.parse({ pinataGatewayUrl: 'https://x.com' })).toThrow()
	})
})

describe('ABI encoding', () => {
	test('encodes modelCount call data', () => {
		const callData = encodeFunctionData({
			abi: ModelRegistryABI,
			functionName: 'modelCount',
		})
		expect(callData).toBeDefined()
		expect(typeof callData).toBe('string')
		expect(callData.startsWith('0x')).toBe(true)
	})

	test('encodes getMetadataHash call data', () => {
		const callData = encodeFunctionData({
			abi: ModelRegistryABI,
			functionName: 'getMetadataHash',
			args: ['test-model-1'],
		})
		expect(callData).toBeDefined()
		expect(callData.startsWith('0x')).toBe(true)
	})

	test('encodes assignTrainingData call data', () => {
		const callData = encodeFunctionData({
			abi: TrainingDataManagerABI,
			functionName: 'assignTrainingData',
			args: ['model-0', 'blob-abc123', 85n],
		})
		expect(callData).toBeDefined()
		expect(callData.startsWith('0x')).toBe(true)
	})

	test('encodes getTrainingData call data', () => {
		const callData = encodeFunctionData({
			abi: TrainingDataManagerABI,
			functionName: 'getTrainingData',
			args: ['model-0'],
		})
		expect(callData).toBeDefined()
		expect(callData.startsWith('0x')).toBe(true)
	})
})

describe('initWorkflow', () => {
	test('returns a single HTTP trigger handler', () => {
		const handlers = initWorkflow(stagingConfig)

		expect(handlers).toHaveLength(1)
		expect(handlers[0].fn).toBe(onSessionClosed)

		const trigger = handlers[0].trigger as {
			configAsAny: () => unknown
			capabilityId: () => string
		}
		expect(typeof trigger.configAsAny).toBe('function')
		expect(typeof trigger.capabilityId).toBe('function')
	})
})

describe('onSessionClosed', () => {
	test('throws when payload input is invalid JSON', () => {
		const runtime = newTestRuntime() as any
		runtime.config = stagingConfig

		const payload = {
			input: new TextEncoder().encode('not-valid-json'),
		}

		expect(() => onSessionClosed(runtime, payload as any)).toThrow()
	})
})
