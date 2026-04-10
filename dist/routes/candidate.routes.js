import path from "node:path";
import { createReadStream } from "node:fs";
import { Router } from "express";
import multer from "multer";
import { createCandidate, getCandidateById, getCandidateMatch, getJobDescriptionById, listCandidates, updateCandidateExtraction, updateCandidateExtractionStatus, updateCandidateStatus, upsertCandidateMatch } from "../db/index.js";
import { env } from "../config/env.js";
import { parsePdfFile } from "../services/pdf.service.js";
import { streamResumeExtraction } from "../services/resume-extraction.service.js";
import { scoreCandidateAgainstJob } from "../services/matching.service.js";
import { cleanResumeText } from "../utils/text.js";
import { nowIso } from "../utils/time.js";
const router = Router();
const storage = multer.diskStorage({
    destination: env.storageDir,
    filename: (_req, file, cb) => {
        cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ".pdf"}`);
    }
});
const upload = multer({
    storage,
    limits: {
        files: 10,
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (_req, file, cb) => {
        const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
        if (isPdf) {
            cb(null, true);
            return;
        }
        cb(new Error("Only PDF files are supported."));
    }
});
function serializeCandidate(candidate) {
    if (!candidate) {
        return null;
    }
    return {
        ...candidate,
        fileUrl: `/api/candidates/${candidate.id}/file`
    };
}
async function runCandidateExtraction(candidateId, onEvent) {
    const candidate = getCandidateById(candidateId);
    if (!candidate) {
        return null;
    }
    updateCandidateExtractionStatus(candidate.id, "processing");
    onEvent?.("status", { label: "开始 AI 信息提取", progress: 0 });
    try {
        const extraction = await streamResumeExtraction(candidate, (event, data) => onEvent?.(event, data));
        const updated = updateCandidateExtraction(candidate.id, extraction);
        onEvent?.("done", { candidate: serializeCandidate(updated) });
        return updated;
    }
    catch (error) {
        updateCandidateExtractionStatus(candidate.id, "failed");
        onEvent?.("error", { message: error instanceof Error ? error.message : "提取失败" });
        throw error;
    }
}
router.get("/compare", (req, res) => {
    const ids = String(req.query.ids ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3);
    const jobId = String(req.query.jobId ?? "");
    const candidates = ids
        .map((id) => getCandidateById(id))
        .filter(Boolean)
        .map((candidate) => serializeCandidate(candidate));
    const matches = jobId
        ? candidates
            .map((candidate) => getCandidateMatch(candidate.id, jobId))
            .filter(Boolean)
        : candidates.map((candidate) => candidate.latestMatch).filter(Boolean);
    res.json({ candidates, matches });
});
router.post("/upload", upload.array("files", 10), async (req, res, next) => {
    try {
        const files = req.files ?? [];
        if (!files.length) {
            return res.status(400).json({ message: "请至少上传一份 PDF 简历。" });
        }
        const createdCandidates = [];
        for (const file of files) {
            const parsed = await parsePdfFile(file.path);
            const cleanText = cleanResumeText(parsed.text);
            const candidate = createCandidate({
                id: crypto.randomUUID(),
                originalName: file.originalname,
                storedName: file.filename,
                filePath: file.path,
                fileSize: file.size,
                pageCount: parsed.pageCount,
                uploadedAt: nowIso(),
                status: "pending",
                rawText: parsed.text,
                cleanText,
                extractionStatus: "idle",
                extraction: {
                    basicInfo: { name: "", phone: "", email: "", city: "" },
                    educations: [],
                    experiences: [],
                    skills: [],
                    projects: []
                }
            });
            createdCandidates.push(serializeCandidate(candidate));
        }
        res.status(201).json({ items: createdCandidates });
    }
    catch (error) {
        next(error);
    }
});
router.get("/", (req, res) => {
    const query = String(req.query.q ?? "").trim().toLowerCase();
    const status = String(req.query.status ?? "").trim();
    const skill = String(req.query.skill ?? "").trim().toLowerCase();
    const sortBy = String(req.query.sortBy ?? "uploadedAt");
    const order = String(req.query.order ?? "desc");
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.max(1, Math.min(50, Number(req.query.pageSize ?? 12)));
    let items = listCandidates();
    if (query) {
        items = items.filter((candidate) => {
            const haystack = [
                candidate.extraction.basicInfo.name,
                candidate.extraction.basicInfo.email,
                candidate.extraction.basicInfo.city,
                candidate.extraction.skills.join(" "),
                candidate.extraction.educations.map((item) => item.school).join(" "),
                candidate.originalName
            ]
                .join(" ")
                .toLowerCase();
            return haystack.includes(query);
        });
    }
    if (status) {
        items = items.filter((candidate) => candidate.status === status);
    }
    if (skill) {
        items = items.filter((candidate) => candidate.extraction.skills.some((item) => item.toLowerCase().includes(skill)));
    }
    items.sort((a, b) => {
        const factor = order === "asc" ? 1 : -1;
        if (sortBy === "score") {
            return ((a.latestMatch?.overallScore ?? 0) - (b.latestMatch?.overallScore ?? 0)) * factor;
        }
        if (sortBy === "name") {
            return a.extraction.basicInfo.name.localeCompare(b.extraction.basicInfo.name) * factor;
        }
        return a.uploadedAt.localeCompare(b.uploadedAt) * factor;
    });
    const total = items.length;
    const paginated = items.slice((page - 1) * pageSize, page * pageSize).map(serializeCandidate);
    res.json({
        items: paginated,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
        }
    });
});
router.get("/:id", (req, res) => {
    const candidate = getCandidateById(req.params.id);
    if (!candidate) {
        return res.status(404).json({ message: "候选人不存在。" });
    }
    res.json(serializeCandidate(candidate));
});
router.get("/:id/file", (req, res) => {
    const candidate = getCandidateById(req.params.id);
    if (!candidate) {
        return res.status(404).json({ message: "文件不存在。" });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(candidate.originalName)}"`);
    createReadStream(candidate.filePath).pipe(res);
});
router.get("/:id/extraction-stream", async (req, res) => {
    const candidate = getCandidateById(req.params.id);
    if (!candidate) {
        return res.status(404).json({ message: "候选人不存在。" });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const writeEvent = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    const heartbeat = setInterval(() => {
        res.write(": keep-alive\n\n");
    }, 15000);
    req.on("close", () => {
        clearInterval(heartbeat);
    });
    try {
        await runCandidateExtraction(candidate.id, writeEvent);
    }
    catch (error) {
        writeEvent("error", { message: error instanceof Error ? error.message : "提取失败" });
    }
    finally {
        clearInterval(heartbeat);
        res.end();
    }
});
router.post("/:id/extract", async (req, res, next) => {
    try {
        const updated = await runCandidateExtraction(req.params.id);
        if (!updated) {
            return res.status(404).json({ message: "候选人不存在。" });
        }
        res.json({ candidate: serializeCandidate(updated) });
    }
    catch (error) {
        next(error);
    }
});
router.patch("/:id/extraction", (req, res) => {
    const candidate = getCandidateById(req.params.id);
    if (!candidate) {
        return res.status(404).json({ message: "候选人不存在。" });
    }
    const payload = req.body;
    const mergedExtraction = {
        basicInfo: {
            ...candidate.extraction.basicInfo,
            ...payload.basicInfo
        },
        educations: payload.educations ?? candidate.extraction.educations,
        experiences: payload.experiences ?? candidate.extraction.experiences,
        skills: payload.skills ?? candidate.extraction.skills,
        projects: payload.projects ?? candidate.extraction.projects
    };
    const updated = updateCandidateExtraction(candidate.id, mergedExtraction);
    res.json(serializeCandidate(updated));
});
router.patch("/:id/status", (req, res) => {
    const status = req.body.status;
    if (!status) {
        return res.status(400).json({ message: "缺少状态字段。" });
    }
    const updated = updateCandidateStatus(req.params.id, status);
    if (!updated) {
        return res.status(404).json({ message: "候选人不存在。" });
    }
    res.json(serializeCandidate(updated));
});
router.post("/:id/match", async (req, res, next) => {
    try {
        const candidate = getCandidateById(req.params.id);
        if (!candidate) {
            return res.status(404).json({ message: "候选人不存在。" });
        }
        const jobId = String(req.body.jobId ?? "");
        const job = getJobDescriptionById(jobId);
        if (!job) {
            return res.status(404).json({ message: "岗位不存在。" });
        }
        const scored = await scoreCandidateAgainstJob(candidate, job);
        const match = upsertCandidateMatch({
            candidateId: candidate.id,
            jobId: job.id,
            overallScore: scored.overallScore,
            skillScore: scored.skillScore,
            experienceScore: scored.experienceScore,
            educationScore: scored.educationScore,
            aiComment: scored.aiComment,
            breakdown: scored.breakdown
        });
        res.json(match);
    }
    catch (error) {
        next(error);
    }
});
export default router;
