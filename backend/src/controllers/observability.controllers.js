import TraceLog from "../../shared/models/traceLog.model.js";
import EvaluationRun from "../../shared/models/evaluationRun.model.js";
import GoldenDataset from "../../shared/models/goldenDataset.model.js";
import { runAblationTest } from "../evaluation/evalHarness.js";
import { evaluateRAGTriad } from "../evaluation/aiJudge.js";
import { generateGoldenDataset } from "../evaluation/goldenGenerator.js";
import { runGoldenEvaluation } from "../evaluation/goldenEvalRunner.js";

/**
 * GET /api/v1/observability/traces
 * Paginated list of agent execution traces.
 */
export const listTraces = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      chatId,
      hasError,
      strategy,
    } = req.query;

    const query = {};
    if (chatId) query.chatId = chatId;
    if (hasError === "true") query.error = { $ne: null };
    if (hasError === "false") query.error = null;
    if (strategy) query["retrievalMetrics.strategy"] = strategy;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [traces, totalCount] = await Promise.all([
      TraceLog.find(query)
        .select("-events") // Omit raw event array in summary list
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      TraceLog.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      traces,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    console.error("❌ Error in listTraces:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to list traces",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/observability/traces/:traceId
 * Full trace details including event log, metrics, and AI evals.
 */
export const getTraceDetails = async (req, res) => {
  try {
    const { traceId } = req.params;

    const trace = await TraceLog.findOne({ traceId }).lean();
    if (!trace) {
      return res.status(404).json({
        success: false,
        message: "Trace not found",
      });
    }

    return res.status(200).json({
      success: true,
      trace,
    });
  } catch (error) {
    console.error("❌ Error in getTraceDetails:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get trace details",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/observability/metrics
 * Aggregated KPIs and metrics for the observability dashboard.
 */
export const getAggregatedMetrics = async (req, res) => {
  try {
    const totalTraces = await TraceLog.countDocuments();
    if (totalTraces === 0) {
      return res.status(200).json({
        success: true,
        metrics: {
          totalRuns: 0,
          avgDurationMs: 0,
          avgRetrievalMs: 0,
          refusalRate: "0%",
          retryRate: "0%",
          avgGradeScore: 0,
          strategyDistribution: {},
          recentAverages: {},
        },
      });
    }

    // Aggregate statistics across the last 500 traces
    const recentTraces = await TraceLog.find()
      .select("duration stepDurations retrievalMetrics error tokenUsage createdAt")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    let totalDuration = 0;
    let totalRetrieval = 0;
    let totalGeneration = 0;
    let refusalCount = 0;
    let retryCount = 0;
    let gradeSum = 0;
    let gradeCount = 0;
    let errorCount = 0;

    const strategyMap = {};
    const channelMap = { VECTOR: 0, BM25: 0, HYDE: 0 };

    for (const t of recentTraces) {
      totalDuration += t.duration || 0;
      totalRetrieval += t.stepDurations?.retrievalMs || 0;
      totalGeneration += t.stepDurations?.generationMs || 0;

      if (t.error) errorCount++;

      const rm = t.retrievalMetrics || {};
      if (rm.refused) refusalCount++;
      if (rm.correctiveRetries > 0) retryCount++;

      if (typeof rm.contextGradeScore === "number") {
        gradeSum += rm.contextGradeScore;
        gradeCount++;
      }

      if (rm.strategy) {
        strategyMap[rm.strategy] = (strategyMap[rm.strategy] || 0) + 1;
      }

      if (Array.isArray(rm.channelsSearched)) {
        for (const ch of rm.channelsSearched) {
          channelMap[ch] = (channelMap[ch] || 0) + 1;
        }
      }
    }

    const sampleSize = recentTraces.length;

    const metrics = {
      totalRuns: totalTraces,
      sampleSize,
      avgDurationMs: Math.round(totalDuration / sampleSize),
      avgRetrievalMs: Math.round(totalRetrieval / sampleSize),
      avgGenerationMs: Math.round(totalGeneration / sampleSize),
      errorRate: `${((errorCount / sampleSize) * 100).toFixed(1)}%`,
      refusalRate: `${((refusalCount / sampleSize) * 100).toFixed(1)}%`,
      retryRate: `${((retryCount / sampleSize) * 100).toFixed(1)}%`,
      avgGradeScore: gradeCount > 0 ? Number((gradeSum / gradeCount).toFixed(1)) : 0,
      strategyDistribution: strategyMap,
      channelUsage: channelMap,
    };

    return res.status(200).json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error("❌ Error in getAggregatedMetrics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to compute metrics",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/observability/evals/ablation
 * Trigger an ablation benchmark suite.
 */
export const runAblation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { testQueries, sourceIds = [], name } = req.body;

    if (!Array.isArray(testQueries) || testQueries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "testQueries must be a non-empty array of questions",
      });
    }

    const report = await runAblationTest(testQueries, {
      sourceIds,
      userId,
      name,
    });

    return res.status(200).json({
      success: true,
      message: "Ablation benchmark complete",
      report,
    });
  } catch (error) {
    console.error("❌ Error in runAblation:", error);
    return res.status(500).json({
      success: false,
      message: "Ablation test run failed",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/observability/evals/ablation
 * List past ablation test runs.
 */
export const listAblationRuns = async (req, res) => {
  try {
    const runs = await EvaluationRun.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      runs,
    });
  } catch (error) {
    console.error("❌ Error in listAblationRuns:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to list ablation runs",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/observability/evals/judge/:traceId
 * Run on-demand LLM-as-a-judge AI evaluations on a completed trace.
 */
export const runAIJudgeOnTrace = async (req, res) => {
  try {
    const { traceId } = req.params;

    const trace = await TraceLog.findOne({ traceId });
    if (!trace) {
      return res.status(404).json({
        success: false,
        message: "Trace not found",
      });
    }

    // Extract query, response, and context from trace
    const question = trace.query;
    const answer = trace.response;
    const context = trace.events
      ?.find((e) => e.name === "pipeline:result")
      ?.evidenceSummary || "";

    const aiEvaluations = await evaluateRAGTriad(question, context, answer);

    // Persist evaluation directly to the trace document
    trace.aiEvaluations = {
      faithfulness: aiEvaluations.faithfulness,
      answerRelevance: aiEvaluations.answerRelevance,
      contextPrecision: aiEvaluations.contextPrecision,
    };
    await trace.save();

    return res.status(200).json({
      success: true,
      message: "AI evaluation completed and persisted",
      traceId,
      aiEvaluations,
    });
  } catch (error) {
    console.error("❌ Error in runAIJudgeOnTrace:", error);
    return res.status(500).json({
      success: false,
      message: "AI evaluation failed",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/observability/evals/goldens/generate
 * Automatically synthesize a Golden Dataset from user documents.
 */
export const generateGoldens = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sourceIds, sampleCount = 5, name } = req.body;

    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "sourceIds array is required to generate golden test cases",
      });
    }

    const goldenDataset = await generateGoldenDataset(sourceIds, userId, {
      sampleCount: Math.min(20, Math.max(1, parseInt(sampleCount, 10))),
      name,
    });

    return res.status(201).json({
      success: true,
      message: "Golden Dataset generated successfully",
      dataset: goldenDataset,
    });
  } catch (error) {
    console.error("❌ Error in generateGoldens:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate golden dataset",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/observability/evals/goldens
 * List golden evaluation datasets.
 */
export const listGoldenDatasets = async (req, res) => {
  try {
    const datasets = await GoldenDataset.find()
      .select("name description sourceIds testCases createdAt")
      .populate("sourceIds", "title originalFileName type")
      .sort({ createdAt: -1 })
      .lean();

    const formatted = datasets.map((d) => ({
      _id: d._id,
      name: d.name,
      description: d.description,
      sourceIds: d.sourceIds,
      testCaseCount: d.testCases?.length || 0,
      createdAt: d.createdAt,
    }));

    return res.status(200).json({
      success: true,
      datasets: formatted,
    });
  } catch (error) {
    console.error("❌ Error in listGoldenDatasets:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to list golden datasets",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/observability/evals/goldens/:datasetId
 * Fetch full golden dataset with all ground truth test cases.
 */
export const getGoldenDataset = async (req, res) => {
  try {
    const { datasetId } = req.params;

    const dataset = await GoldenDataset.findById(datasetId)
      .populate("sourceIds", "title originalFileName type")
      .lean();

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Golden dataset not found",
      });
    }

    return res.status(200).json({
      success: true,
      dataset,
    });
  } catch (error) {
    console.error("❌ Error in getGoldenDataset:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch golden dataset",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/observability/evals/goldens/:datasetId/run
 * Run full RAG evaluation benchmark against a Golden Dataset.
 * Computes Context Recall, Answer Correctness, Faithfulness, Relevance & Latency.
 */
export const runGoldenEval = async (req, res) => {
  try {
    const userId = req.user._id;
    const { datasetId } = req.params;

    const report = await runGoldenEvaluation(datasetId, userId);

    return res.status(200).json({
      success: true,
      message: "Golden evaluation benchmark completed",
      report,
    });
  } catch (error) {
    console.error("❌ Error in runGoldenEval:", error);
    return res.status(500).json({
      success: false,
      message: "Golden evaluation benchmark failed",
      error: error.message,
    });
  }
};
