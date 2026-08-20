// Lazy-loaded embedding pipeline using @xenova/transformers.
// Downloads Xenova/all-MiniLM-L6-v2 (~25 MB) on first call and caches it.
// Outputs 384-dimensional cosine-normalized float vectors.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipeline: any = null;

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const DIMS  = 384;

export const EMBEDDING_DIMS = DIMS;

async function getPipeline() {
  if (_pipeline) return _pipeline;

  console.log('[embedder] Loading model (first run downloads ~25 MB)...');
  // Dynamic import keeps the ESM package out of the CJS module graph
  const { pipeline, env } = await import('@xenova/transformers');

  // Suppress the @xenova progress bars in server output
  env.allowLocalModels = false;

  _pipeline = await pipeline('feature-extraction', MODEL);
  console.log('[embedder] Model ready.');
  return _pipeline;
}

export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getPipeline();
  const output = await pipe(text.slice(0, 512), { pooling: 'mean', normalize: true });
  return output.data as Float32Array;
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const pipe = await getPipeline();
  return Promise.all(
    texts.map(async t => {
      const out = await pipe(t.slice(0, 512), { pooling: 'mean', normalize: true });
      return out.data as Float32Array;
    })
  );
}
