import { DEMO_CONFIG } from "./constants";

export interface EmbeddingResponse {
  vectors: number[][];
  model: string;
  dimension: number;
  revision: string;
}

export async function generateBgeM3Embeddings(texts: string[]): Promise<EmbeddingResponse> {
  const workerUrl = process.env.EMBEDDING_WORKER_URL || "http://127.0.0.1:8002";
  
  if (!texts || texts.length === 0) {
    return {
      vectors: [],
      model: DEMO_CONFIG.model.id,
      dimension: DEMO_CONFIG.model.dimension,
      revision: DEMO_CONFIG.model.revision,
    };
  }

  let res: Response;
  try {
    res = await fetch(`${workerUrl}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: texts }),
      signal: AbortSignal.timeout(60000), // 60-second timeout for large batch embedding
    });
  } catch (err: any) {
    const isTimeout = err.name === "TimeoutError" || err.message?.includes("timeout");
    throw new Error(
      isTimeout
        ? `EMBEDDING_WORKER_TIMEOUT: Self-hosted embedding worker at ${workerUrl} timed out after 5000ms.`
        : `EMBEDDING_WORKER_UNAVAILABLE: Failed to connect to embedding worker at ${workerUrl}: ${err.message}`
    );
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`EMBEDDING_WORKER_ERROR: HTTP ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const vectors: number[][] = data.data.map((item: any) => item.embedding);

  for (const v of vectors) {
    if (v.length !== DEMO_CONFIG.model.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${DEMO_CONFIG.model.dimension}, got ${v.length}`);
    }
  }

  return {
    vectors,
    model: DEMO_CONFIG.model.id,
    dimension: DEMO_CONFIG.model.dimension,
    revision: DEMO_CONFIG.model.revision,
  };
}
