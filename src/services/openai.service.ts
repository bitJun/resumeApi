import { env } from "../config/env.js";
import { JobDescriptionRecord, MatchRecord, ResumeExtraction } from "../types/index.js";
import { stripCodeFence } from "../utils/text.js";

async function requestOpenAI(systemPrompt: string, userPrompt: string) {
  if (!env.openAiApiKey) {
    return null;
  }

  const response = await fetch(`${env.openAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openAiApiKey}`
    },
    body: JSON.stringify({
      model: env.openAiModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI returned an empty completion.");
  }

  return stripCodeFence(content);
}

export async function extractResumeWithAI(
  text: string,
  heuristicResult: ResumeExtraction,
  originalName?: string
) {
  const content = await requestOpenAI(
    [
      "You extract resume data into strict JSON.",
      "Return only JSON with keys: basicInfo, educations, experiences, skills, projects.",
      "basicInfo must include name, phone, email, city.",
      "educations items must include school, major, degree, graduationTime.",
      "experiences items must include companyName, title, period, summary.",
      "projects items must include name, techStack, responsibility, highlights.",
      "skills must be a string array.",
      "When uncertain, keep empty string or empty array instead of inventing facts."
    ].join(" "),
    JSON.stringify({
      originalFileName: originalName ?? "",
      heuristicResult,
      resumeText: text.slice(0, 24000)
    })
  );

  if (!content) {
    return null;
  }

  return JSON.parse(content) as ResumeExtraction;
}

export async function scoreResumeWithAI(
  extraction: ResumeExtraction,
  job: JobDescriptionRecord,
  heuristicResult: Omit<MatchRecord, "id" | "candidateId" | "jobId" | "createdAt" | "updatedAt">
) {
  const content = await requestOpenAI(
    [
      "You are a recruiting analyst.",
      "Evaluate candidate-job fit and return strict JSON only.",
      "Keys: overallScore, skillScore, experienceScore, educationScore, aiComment, breakdown.",
      "Scores must be integers from 0 to 100.",
      "breakdown must include matchedMustSkills, matchedBonusSkills, missingMustSkills arrays.",
      "Do not add markdown."
    ].join(" "),
    JSON.stringify({
      job,
      candidate: extraction,
      heuristicResult
    })
  );

  if (!content) {
    return null;
  }

  return JSON.parse(content) as Omit<MatchRecord, "id" | "candidateId" | "jobId" | "createdAt" | "updatedAt">;
}
