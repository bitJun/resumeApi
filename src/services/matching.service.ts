import { CandidateRecord, JobDescriptionRecord, MatchRecord, ResumeExtraction } from "../types/index.js";
import { normalizeKeyword, uniqueStrings } from "../utils/text.js";
import { scoreResumeWithAI } from "./openai.service.js";

function normalizeSkills(skills: string[]) {
  return uniqueStrings(skills.map((skill) => skill.trim())).map((skill) => ({
    raw: skill,
    normalized: normalizeKeyword(skill)
  }));
}

function calculateSkillScore(candidateSkills: string[], job: JobDescriptionRecord) {
  const normalizedCandidateSkills = normalizeSkills(candidateSkills);
  const mustSkills = normalizeSkills(job.mustSkills);
  const bonusSkills = normalizeSkills(job.bonusSkills);

  const matchedMustSkills = mustSkills
    .filter((skill) => normalizedCandidateSkills.some((item) => item.normalized.includes(skill.normalized)))
    .map((skill) => skill.raw);
  const matchedBonusSkills = bonusSkills
    .filter((skill) => normalizedCandidateSkills.some((item) => item.normalized.includes(skill.normalized)))
    .map((skill) => skill.raw);
  const missingMustSkills = mustSkills
    .filter((skill) => !normalizedCandidateSkills.some((item) => item.normalized.includes(skill.normalized)))
    .map((skill) => skill.raw);

  const mustWeight = mustSkills.length ? matchedMustSkills.length / mustSkills.length : 1;
  const bonusWeight = bonusSkills.length ? matchedBonusSkills.length / bonusSkills.length : 0.7;
  const skillScore = Math.round(Math.min(100, mustWeight * 75 + bonusWeight * 25));

  return {
    skillScore,
    matchedMustSkills,
    matchedBonusSkills,
    missingMustSkills
  };
}

function parseYears(period: string) {
  const years = Array.from(period.matchAll(/(19|20)\d{2}/g)).map((item) => Number(item[0]));

  if (!years.length) {
    return 0;
  }

  if (years.length === 1) {
    return Math.max(1, new Date().getFullYear() - years[0]);
  }

  return Math.max(1, years[years.length - 1] - years[0]);
}

function calculateExperienceScore(extraction: ResumeExtraction, job: JobDescriptionRecord) {
  const totalYears = extraction.experiences.reduce((sum, item) => sum + parseYears(item.period), 0);
  const description = normalizeKeyword(job.description);
  const experienceText = normalizeKeyword(
    extraction.experiences.map((item) => `${item.title} ${item.summary}`).join(" ")
  );
  const roleKeywordMatches = job.mustSkills.filter((skill) => experienceText.includes(normalizeKeyword(skill))).length;
  const titleMatches = /(engineer|developer|architect|manager|lead|分析|开发|工程师|负责人|经理)/i.test(
    extraction.experiences.map((item) => item.title).join(" ")
  );

  let score = Math.min(100, 42 + totalYears * 8 + roleKeywordMatches * 7 + (titleMatches ? 8 : 0));

  if (description.includes("senior") || description.includes("资深")) {
    score -= totalYears < 5 ? 12 : 0;
  }

  return Math.max(0, Math.round(score));
}

function calculateEducationScore(extraction: ResumeExtraction, job: JobDescriptionRecord) {
  const text = `${job.title} ${job.description}`.toLowerCase();
  const highestDegree =
    extraction.educations.find((item) => /博士|phd/i.test(item.degree))?.degree ??
    extraction.educations.find((item) => /硕士|master/i.test(item.degree))?.degree ??
    extraction.educations.find((item) => /本科|bachelor/i.test(item.degree))?.degree ??
    extraction.educations[0]?.degree ??
    "";
  const majorText = extraction.educations.map((item) => item.major).join(" ").toLowerCase();

  let score = 60;

  if (/博士|phd/i.test(highestDegree)) {
    score = 96;
  } else if (/硕士|master/i.test(highestDegree)) {
    score = 88;
  } else if (/本科|bachelor/i.test(highestDegree)) {
    score = 78;
  }

  if (/computer|software|data|人工智能|计算机|软件|信息|统计|数学/i.test(majorText) && /engineer|developer|ai|data|算法|开发/.test(text)) {
    score += 10;
  }

  return Math.min(100, score);
}

function buildComment(
  extraction: ResumeExtraction,
  job: JobDescriptionRecord,
  scores: {
    overallScore: number;
    skillScore: number;
    experienceScore: number;
    educationScore: number;
    matchedMustSkills: string[];
    matchedBonusSkills: string[];
    missingMustSkills: string[];
  }
) {
  const name = extraction.basicInfo.name || "该候选人";
  const strengths = [
    scores.matchedMustSkills.length ? `已覆盖核心必备技能：${scores.matchedMustSkills.join("、")}` : "",
    extraction.experiences.length ? `具备 ${extraction.experiences.length} 段可识别工作经历` : "",
    extraction.educations[0]?.school ? `教育背景来自 ${extraction.educations[0].school}` : "",
    scores.matchedBonusSkills.length ? `额外亮点技能包括 ${scores.matchedBonusSkills.join("、")}` : ""
  ].filter(Boolean);

  const risks = [
    scores.missingMustSkills.length ? `仍缺少部分关键能力：${scores.missingMustSkills.join("、")}` : "",
    scores.experienceScore < 60 ? `经验相关性仍需进一步人工复核` : "",
    !extraction.projects.length ? `项目经历信息较少，建议面试中补充追问` : ""
  ].filter(Boolean);

  return `${name} 与「${job.title}」岗位的综合匹配度为 ${scores.overallScore} 分。${strengths.join("；")}。${risks.join("；")}。`.replace(
    /。+/g,
    "。"
  );
}

export async function scoreCandidateAgainstJob(candidate: CandidateRecord, job: JobDescriptionRecord) {
  const extraction = candidate.extraction;
  const skill = calculateSkillScore(extraction.skills, job);
  const experienceScore = calculateExperienceScore(extraction, job);
  const educationScore = calculateEducationScore(extraction, job);
  const overallScore = Math.round(skill.skillScore * 0.46 + experienceScore * 0.34 + educationScore * 0.2);

  const heuristicResult: Omit<MatchRecord, "id" | "candidateId" | "jobId" | "createdAt" | "updatedAt"> = {
    overallScore,
    skillScore: skill.skillScore,
    experienceScore,
    educationScore,
    aiComment: buildComment(extraction, job, {
      overallScore,
      skillScore: skill.skillScore,
      experienceScore,
      educationScore,
      matchedMustSkills: skill.matchedMustSkills,
      matchedBonusSkills: skill.matchedBonusSkills,
      missingMustSkills: skill.missingMustSkills
    }),
    breakdown: {
      matchedMustSkills: skill.matchedMustSkills,
      matchedBonusSkills: skill.matchedBonusSkills,
      missingMustSkills: skill.missingMustSkills
    }
  };

  try {
    const aiResult = await scoreResumeWithAI(extraction, job, heuristicResult);
    if (aiResult) {
      return {
        ...heuristicResult,
        ...aiResult
      };
    }
  } catch (error) {
    console.error("AI scoring failed, fallback to heuristic result.", error);
  }

  return heuristicResult;
}
