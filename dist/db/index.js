import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { nowIso } from "../utils/time.js";
import { safeJsonParse, toJson } from "../utils/json.js";
const EMPTY_EXTRACTION = {
    basicInfo: { name: "", phone: "", email: "", city: "" },
    educations: [],
    experiences: [],
    skills: [],
    projects: []
};
const database = new Database(env.databaseFile);
database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS candidates (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    uploaded_at TEXT NOT NULL,
    status TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    clean_text TEXT NOT NULL,
    extraction_status TEXT NOT NULL,
    extraction_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS job_descriptions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    must_skills_json TEXT NOT NULL,
    bonus_skills_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS candidate_job_matches (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    overall_score INTEGER NOT NULL,
    skill_score INTEGER NOT NULL,
    experience_score INTEGER NOT NULL,
    education_score INTEGER NOT NULL,
    ai_comment TEXT NOT NULL,
    breakdown_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(candidate_id, job_id)
  );
`);
function mapMatchRow(row) {
    return {
        id: row.id,
        candidateId: row.candidate_id,
        jobId: row.job_id,
        overallScore: row.overall_score,
        skillScore: row.skill_score,
        experienceScore: row.experience_score,
        educationScore: row.education_score,
        aiComment: row.ai_comment,
        breakdown: safeJsonParse(row.breakdown_json, {
            matchedMustSkills: [],
            matchedBonusSkills: [],
            missingMustSkills: []
        }),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}
function mapCandidateRow(row) {
    const matchesRows = database
        .prepare(`
        SELECT *
        FROM candidate_job_matches
        WHERE candidate_id = ?
        ORDER BY updated_at DESC
      `)
        .all(row.id);
    const matches = matchesRows.map(mapMatchRow);
    return {
        id: row.id,
        originalName: row.original_name,
        storedName: row.stored_name,
        filePath: row.file_path,
        fileSize: row.file_size,
        pageCount: row.page_count,
        uploadedAt: row.uploaded_at,
        status: row.status,
        rawText: row.raw_text,
        cleanText: row.clean_text,
        extractionStatus: row.extraction_status,
        extraction: safeJsonParse(row.extraction_json, EMPTY_EXTRACTION),
        latestMatch: matches[0] ?? null,
        matches
    };
}
function mapJobRow(row) {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        mustSkills: safeJsonParse(row.must_skills_json, []),
        bonusSkills: safeJsonParse(row.bonus_skills_json, []),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}
export function createCandidate(candidate) {
    database
        .prepare(`
        INSERT INTO candidates (
          id,
          original_name,
          stored_name,
          file_path,
          file_size,
          page_count,
          uploaded_at,
          status,
          raw_text,
          clean_text,
          extraction_status,
          extraction_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .run(candidate.id, candidate.originalName, candidate.storedName, candidate.filePath, candidate.fileSize, candidate.pageCount, candidate.uploadedAt, candidate.status, candidate.rawText, candidate.cleanText, candidate.extractionStatus, toJson(candidate.extraction));
    return getCandidateById(candidate.id);
}
export function listCandidates() {
    const rows = database
        .prepare(`
        SELECT *
        FROM candidates
        ORDER BY uploaded_at DESC
      `)
        .all();
    return rows.map(mapCandidateRow);
}
export function getCandidateById(candidateId) {
    const row = database
        .prepare(`
        SELECT *
        FROM candidates
        WHERE id = ?
      `)
        .get(candidateId);
    return row ? mapCandidateRow(row) : null;
}
export function updateCandidateExtractionStatus(candidateId, status) {
    database
        .prepare(`
        UPDATE candidates
        SET extraction_status = ?
        WHERE id = ?
      `)
        .run(status, candidateId);
}
export function updateCandidateExtraction(candidateId, extraction) {
    database
        .prepare(`
        UPDATE candidates
        SET extraction_json = ?, extraction_status = ?
        WHERE id = ?
      `)
        .run(toJson(extraction), "completed", candidateId);
    return getCandidateById(candidateId);
}
export function updateCandidateStatus(candidateId, status) {
    database
        .prepare(`
        UPDATE candidates
        SET status = ?
        WHERE id = ?
      `)
        .run(status, candidateId);
    return getCandidateById(candidateId);
}
export function upsertJobDescription(job) {
    const now = nowIso();
    const id = job.id ?? crypto.randomUUID();
    const existing = getJobDescriptionById(id);
    if (existing) {
        database
            .prepare(`
          UPDATE job_descriptions
          SET title = ?, description = ?, must_skills_json = ?, bonus_skills_json = ?, updated_at = ?
          WHERE id = ?
        `)
            .run(job.title, job.description, toJson(job.mustSkills), toJson(job.bonusSkills), now, id);
    }
    else {
        database
            .prepare(`
          INSERT INTO job_descriptions (
            id,
            title,
            description,
            must_skills_json,
            bonus_skills_json,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
            .run(id, job.title, job.description, toJson(job.mustSkills), toJson(job.bonusSkills), now, now);
    }
    return getJobDescriptionById(id);
}
export function listJobDescriptions() {
    const rows = database
        .prepare(`
        SELECT *
        FROM job_descriptions
        ORDER BY updated_at DESC
      `)
        .all();
    return rows.map(mapJobRow);
}
export function getJobDescriptionById(jobId) {
    const row = database
        .prepare(`
        SELECT *
        FROM job_descriptions
        WHERE id = ?
      `)
        .get(jobId);
    return row ? mapJobRow(row) : null;
}
export function upsertCandidateMatch(match) {
    const now = nowIso();
    const existing = database
        .prepare(`
        SELECT *
        FROM candidate_job_matches
        WHERE candidate_id = ? AND job_id = ?
      `)
        .get(match.candidateId, match.jobId);
    if (existing) {
        database
            .prepare(`
          UPDATE candidate_job_matches
          SET overall_score = ?, skill_score = ?, experience_score = ?, education_score = ?, ai_comment = ?, breakdown_json = ?, updated_at = ?
          WHERE candidate_id = ? AND job_id = ?
        `)
            .run(match.overallScore, match.skillScore, match.experienceScore, match.educationScore, match.aiComment, toJson(match.breakdown), now, match.candidateId, match.jobId);
    }
    else {
        const id = match.id ?? crypto.randomUUID();
        database
            .prepare(`
          INSERT INTO candidate_job_matches (
            id,
            candidate_id,
            job_id,
            overall_score,
            skill_score,
            experience_score,
            education_score,
            ai_comment,
            breakdown_json,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
            .run(id, match.candidateId, match.jobId, match.overallScore, match.skillScore, match.experienceScore, match.educationScore, match.aiComment, toJson(match.breakdown), now, now);
    }
    return getCandidateMatch(match.candidateId, match.jobId);
}
export function getCandidateMatch(candidateId, jobId) {
    const row = database
        .prepare(`
        SELECT *
        FROM candidate_job_matches
        WHERE candidate_id = ? AND job_id = ?
      `)
        .get(candidateId, jobId);
    return row ? mapMatchRow(row) : null;
}
export function listCandidateMatchesByJob(jobId) {
    const rows = database
        .prepare(`
        SELECT *
        FROM candidate_job_matches
        WHERE job_id = ?
        ORDER BY overall_score DESC, updated_at DESC
      `)
        .all(jobId);
    return rows.map(mapMatchRow);
}
