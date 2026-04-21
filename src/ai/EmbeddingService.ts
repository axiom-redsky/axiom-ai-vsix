import { ExtensionConfig } from '../config/ExtensionConfig';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeatureExtractionPipeline = (text: string, options?: Record<string, unknown>) => Promise<any>;

let _pipeline: FeatureExtractionPipeline | null = null;
let _initPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * transformers.js 파이프라인을 싱글턴으로 초기화한다.
 * 첫 호출 시 모델을 다운로드·캐시하므로 확장 activate 시점에 미리 호출하면 좋다.
 */
export async function initEmbeddingPipeline(): Promise<void> {
  await _getPipeline();
}

/**
 * 텍스트를 로컬 임베딩 벡터로 변환한다.
 * 결과는 mean-pooling + L2 정규화된 Float32 배열이다.
 */
export async function embed(text: string): Promise<number[]> {
  const pipe = await _getPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  // output.data 는 Float32Array
  return Array.from(output.data as Float32Array);
}

async function _getPipeline(): Promise<FeatureExtractionPipeline> {
  if (_pipeline) return _pipeline;
  if (!_initPromise) {
    _initPromise = _loadPipeline();
  }
  _pipeline = await _initPromise;
  return _pipeline;
}

async function _loadPipeline(): Promise<FeatureExtractionPipeline> {
  // @xenova/transformers 는 esbuild external → Node require 로 런타임 로드
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pipeline } = require('@xenova/transformers');
  const model = ExtensionConfig.getRagConfig().embeddingModel;
  return pipeline('feature-extraction', model);
}
