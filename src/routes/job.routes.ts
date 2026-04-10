import { Router } from "express";
import {
  getCandidateById,
  getJobDescriptionById,
  listCandidates,
  listCandidateMatchesByJob,
  listJobDescriptions,
  upsertCandidateMatch,
  upsertJobDescription
} from "../db/index.js";
import { scoreCandidateAgainstJob } from "../services/matching.service.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ items: listJobDescriptions() });
});

router.get("/:id", (req, res) => {
  const job = getJobDescriptionById(req.params.id);

  if (!job) {
    return res.status(404).json({ message: "岗位不存在。" });
  }

  const matches = listCandidateMatchesByJob(job.id);
  res.json({ ...job, matches });
});

router.post("/", (req, res) => {
  const job = upsertJobDescription({
    title: String(req.body.title ?? "未命名岗位"),
    description: String(req.body.description ?? ""),
    mustSkills: Array.isArray(req.body.mustSkills) ? req.body.mustSkills : [],
    bonusSkills: Array.isArray(req.body.bonusSkills) ? req.body.bonusSkills : []
  });

  res.status(201).json(job);
});

router.put("/:id", (req, res) => {
  const existing = getJobDescriptionById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: "岗位不存在。" });
  }

  const job = upsertJobDescription({
    id: req.params.id,
    title: String(req.body.title ?? existing.title),
    description: String(req.body.description ?? existing.description),
    mustSkills: Array.isArray(req.body.mustSkills) ? req.body.mustSkills : existing.mustSkills,
    bonusSkills: Array.isArray(req.body.bonusSkills) ? req.body.bonusSkills : existing.bonusSkills
  });

  res.json(job);
});

router.post("/:id/score-candidates", async (req, res, next) => {
  try {
    const job = getJobDescriptionById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: "岗位不存在。" });
    }

    const candidateIds = Array.isArray(req.body.candidateIds) ? req.body.candidateIds : [];
    const candidates = candidateIds.length
      ? candidateIds.map((id: string) => getCandidateById(String(id))).filter(Boolean)
      : listCandidates();

    const matches = [];

    for (const candidate of candidates) {
      const scored = await scoreCandidateAgainstJob(candidate!, job);
      const match = upsertCandidateMatch({
        candidateId: candidate!.id,
        jobId: job.id,
        overallScore: scored.overallScore,
        skillScore: scored.skillScore,
        experienceScore: scored.experienceScore,
        educationScore: scored.educationScore,
        aiComment: scored.aiComment,
        breakdown: scored.breakdown
      });
      matches.push(match);
    }

    matches.sort((a, b) => b.overallScore - a.overallScore);
    res.json({ items: matches });
  } catch (error) {
    next(error);
  }
});

export default router;
