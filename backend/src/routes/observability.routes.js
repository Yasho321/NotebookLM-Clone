import { Router } from "express";
import { isLoggedIn, isAdmin } from "../middlewares/auth.middlewares.js";
import {
  listTraces,
  getTraceDetails,
  getAggregatedMetrics,
  runAblation,
  listAblationRuns,
  runAIJudgeOnTrace,
  generateGoldens,
  listGoldenDatasets,
  getGoldenDataset,
  runGoldenEval,
} from "../controllers/observability.controllers.js";

const router = Router();

// ── STRICT SECURITY: Accessible exclusively to authenticated admin (yashovardhans321@chithilm.com)
router.use(isLoggedIn, isAdmin);

// ── Agent Traces ─────────────────────────────────────────────────────────────
router.get("/traces", listTraces);
router.get("/traces/:traceId", getTraceDetails);

// ── Dashboard KPIs & Aggregated Metrics ──────────────────────────────────────
router.get("/metrics", getAggregatedMetrics);

// ── Retrieval Ablation & Benchmarks ──────────────────────────────────────────
router.post("/evals/ablation", runAblation);
router.get("/evals/ablation", listAblationRuns);

// ── AI Evals (LLM-as-a-Judge) ────────────────────────────────────────────────
router.post("/evals/judge/:traceId", runAIJudgeOnTrace);

// ── Golden Evaluation Datasets & Benchmarks ─────────────────────────────────
router.post("/evals/goldens/generate", generateGoldens);
router.get("/evals/goldens", listGoldenDatasets);
router.get("/evals/goldens/:datasetId", getGoldenDataset);
router.post("/evals/goldens/:datasetId/run", runGoldenEval);

export default router;
