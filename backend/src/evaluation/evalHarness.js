import { retrievalPipeline } from "../retrieval/pipeline.js";
import EvaluationRun from "../../shared/models/evaluationRun.model.js";

/**
 * Computes retrieval quality and ranking metrics for a pipeline output.
 *
 * @param {object} result - Output of retrievalPipeline
 * @returns {object} Standardized metrics
 */
export function computeMetrics(result) {
  if (!result || !result.docs) {
    return {
      latencyMs: 0,
      hitRate: 0,
      mrr: 0,
      precisionAtK: 0,
      gradeScore: 0,
      chunksCount: 0,
      topSnippet: "",
    };
  }

  const docs = result.docs || [];
  const gradeScore = result.grade?.score ?? (docs.length > 0 ? 6 : 0);
  const latencyMs = result.metadata?.timings?.totalMs || 0;

  // Hit Rate: 1 if at least one document was retrieved with sufficient relevance, else 0
  const hitRate = docs.length > 0 && !result.shouldRefuse && gradeScore >= 4 ? 1 : 0;

  // MRR (Mean Reciprocal Rank): Inverse of the rank of the first relevant document
  // Since top document is rank 1, if hitRate == 1, MRR is 1.0 (or 1 / rank)
  const mrr = hitRate ? 1.0 : 0.0;

  // Precision@k: Proportion of retrieved documents that are relevant
  const precisionAtK = docs.length > 0
    ? Number((Math.min(1.0, gradeScore / 10)).toFixed(2))
    : 0;

  const topDoc = docs[0];
  const topSnippet = topDoc
    ? (topDoc.content || topDoc.pageContent || "").slice(0, 120).trim()
    : "";

  return {
    latencyMs,
    hitRate,
    mrr,
    precisionAtK,
    gradeScore,
    chunksCount: docs.length,
    topSnippet,
  };
}

/**
 * Calculates aggregate averages across an array of metric objects.
 */
function aggregateMetrics(metricsList = []) {
  if (metricsList.length === 0) {
    return {
      avgLatencyMs: 0,
      avgHitRate: 0,
      avgMRR: 0,
      avgPrecisionAtK: 0,
      avgGradeScore: 0,
    };
  }

  const count = metricsList.length;
  const sum = metricsList.reduce(
    (acc, m) => {
      acc.latencyMs += m.latencyMs || 0;
      acc.hitRate += m.hitRate || 0;
      acc.mrr += m.mrr || 0;
      acc.precisionAtK += m.precisionAtK || 0;
      acc.gradeScore += m.gradeScore || 0;
      return acc;
    },
    { latencyMs: 0, hitRate: 0, mrr: 0, precisionAtK: 0, gradeScore: 0 }
  );

  return {
    avgLatencyMs: Math.round(sum.latencyMs / count),
    avgHitRate: Number((sum.hitRate / count).toFixed(3)),
    avgMRR: Number((sum.mrr / count).toFixed(3)),
    avgPrecisionAtK: Number((sum.precisionAtK / count).toFixed(3)),
    avgGradeScore: Number((sum.gradeScore / count).toFixed(1)),
  };
}

/**
 * Runs an ablation benchmark suite across a set of test queries.
 * Compares:
 * 1. full: Complete Advanced RAG Pipeline
 * 2. noRerank: Without LLM Reranking + MMR
 * 3. noHyde: Without HyDE generation
 * 4. noBM25: Pure Vector Search (No BM25)
 * 5. noCRAG: Without Corrective Retrieval Loop
 * 6. noFloor: Without Dynamic Relevance Floor
 *
 * @param {string[]} testQueries - Array of test queries to benchmark
 * @param {object} options - { sourceIds, userId, name }
 * @returns {Promise<object>} Complete ablation benchmark report & saved document
 */
export async function runAblationTest(testQueries = [], { sourceIds = [], userId, name } = {}) {
  if (!Array.isArray(testQueries) || testQueries.length === 0) {
    throw new Error("testQueries must be a non-empty array of strings");
  }

  const results = [];
  const variantMetricsMap = {
    full: [],
    noRerank: [],
    noHyde: [],
    noBM25: [],
    noCRAG: [],
    noFloor: [],
  };

  console.log(`🔬 Starting ablation test suite across ${testQueries.length} queries...`);

  for (const query of testQueries) {
    console.log(`  ▶ Testing query: "${query}"`);

    // 1. Full pipeline
    const fullRes = await retrievalPipeline(query, sourceIds, userId, [], {});
    const fullMetrics = computeMetrics(fullRes);
    variantMetricsMap.full.push(fullMetrics);

    // 2. No Reranking
    const noRerankRes = await retrievalPipeline(query, sourceIds, userId, [], {
      skipRerank: true,
    });
    const noRerankMetrics = computeMetrics(noRerankRes);
    variantMetricsMap.noRerank.push(noRerankMetrics);

    // 3. No HyDE
    const noHydeRes = await retrievalPipeline(query, sourceIds, userId, [], {
      skipHyde: true,
    });
    const noHydeMetrics = computeMetrics(noHydeRes);
    variantMetricsMap.noHyde.push(noHydeMetrics);

    // 4. No BM25 (Pure Vector)
    const noBM25Res = await retrievalPipeline(query, sourceIds, userId, [], {
      skipBM25: true,
    });
    const noBM25Metrics = computeMetrics(noBM25Res);
    variantMetricsMap.noBM25.push(noBM25Metrics);

    // 5. No CRAG Loop
    const noCRAGRes = await retrievalPipeline(query, sourceIds, userId, [], {
      skipCRAG: true,
    });
    const noCRAGMetrics = computeMetrics(noCRAGRes);
    variantMetricsMap.noCRAG.push(noCRAGMetrics);

    // 6. No Relevance Floor
    const noFloorRes = await retrievalPipeline(query, sourceIds, userId, [], {
      skipFloor: true,
    });
    const noFloorMetrics = computeMetrics(noFloorRes);
    variantMetricsMap.noFloor.push(noFloorMetrics);

    results.push({
      query,
      full: fullMetrics,
      noRerank: noRerankMetrics,
      noHyde: noHydeMetrics,
      noBM25: noBM25Metrics,
      noCRAG: noCRAGMetrics,
      noFloor: noFloorMetrics,
    });
  }

  // Aggregate summary
  const summary = {
    full: aggregateMetrics(variantMetricsMap.full),
    noRerank: aggregateMetrics(variantMetricsMap.noRerank),
    noHyde: aggregateMetrics(variantMetricsMap.noHyde),
    noBM25: aggregateMetrics(variantMetricsMap.noBM25),
    noCRAG: aggregateMetrics(variantMetricsMap.noCRAG),
    noFloor: aggregateMetrics(variantMetricsMap.noFloor),
  };

  // Save to MongoDB if userId is provided
  let savedRun = null;
  if (userId) {
    savedRun = await EvaluationRun.create({
      userId,
      name: name || `Ablation Benchmark (${testQueries.length} queries)`,
      testQueries,
      sourceIds: Array.isArray(sourceIds) ? sourceIds : [sourceIds],
      variantsTested: ["full", "noRerank", "noHyde", "noBM25", "noCRAG", "noFloor"],
      results,
      summary,
    });
  }

  console.log(`✅ Ablation benchmark complete.`);
  return {
    runId: savedRun?._id,
    summary,
    results,
    testQueriesCount: testQueries.length,
  };
}
