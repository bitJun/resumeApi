import { wait } from "../utils/time.js";
import { extractResumeHeuristically } from "./heuristic.service.js";
import { extractResumeWithAI } from "./openai.service.js";
function mergeExtraction(primary, fallback) {
    return {
        basicInfo: {
            name: primary.basicInfo?.name || fallback.basicInfo.name,
            phone: primary.basicInfo?.phone || fallback.basicInfo.phone,
            email: primary.basicInfo?.email || fallback.basicInfo.email,
            city: primary.basicInfo?.city || fallback.basicInfo.city
        },
        educations: primary.educations?.length ? primary.educations : fallback.educations,
        experiences: primary.experiences?.length ? primary.experiences : fallback.experiences,
        skills: primary.skills?.length ? primary.skills : fallback.skills,
        projects: primary.projects?.length ? primary.projects : fallback.projects
    };
}
export async function extractResume(candidate) {
    const heuristic = extractResumeHeuristically(candidate.cleanText);
    try {
        const aiResult = await extractResumeWithAI(candidate.cleanText, heuristic, candidate.originalName);
        if (aiResult) {
            return mergeExtraction(aiResult, heuristic);
        }
    }
    catch (error) {
        console.error("AI extraction failed, falling back to heuristic result.", error);
    }
    return heuristic;
}
export async function streamResumeExtraction(candidate, onEvent) {
    onEvent("progress", { step: "reading", label: "已读取清洗后的简历文本", progress: 10 });
    await wait(180);
    const result = await extractResume(candidate);
    const sections = [
        ["basicInfo", result.basicInfo, 35, "识别基本信息"],
        ["educations", result.educations, 55, "抽取教育经历"],
        ["experiences", result.experiences, 72, "整理工作经历"],
        ["skills", result.skills, 88, "提炼技能标签"],
        ["projects", result.projects, 96, "汇总项目经历"]
    ];
    for (const [section, payload, progress, label] of sections) {
        onEvent("section", { section, payload, progress, label });
        await wait(140);
    }
    onEvent("completed", { progress: 100, label: "提取完成", extraction: result });
    return result;
}
