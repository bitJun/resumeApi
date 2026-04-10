import { normalizeKeyword, splitCommaValues, uniqueStrings } from "../utils/text.js";
const SKILL_LIBRARY = [
    "javascript",
    "typescript",
    "python",
    "java",
    "go",
    "rust",
    "react",
    "next.js",
    "vue",
    "node.js",
    "express",
    "nestjs",
    "fastapi",
    "flask",
    "spring",
    "mysql",
    "postgresql",
    "mongodb",
    "redis",
    "docker",
    "kubernetes",
    "aws",
    "gcp",
    "azure",
    "linux",
    "git",
    "graphql",
    "restful",
    "nginx",
    "tailwind",
    "antd",
    "figma",
    "ci/cd",
    "machine learning",
    "nlp",
    "llm",
    "openai",
    "langchain",
    "pytorch",
    "tensorflow",
    "spark",
    "hadoop",
    "excel",
    "power bi",
    "tableau"
];
const CITY_LIBRARY = [
    "北京",
    "上海",
    "深圳",
    "广州",
    "杭州",
    "苏州",
    "成都",
    "武汉",
    "西安",
    "南京",
    "Hong Kong",
    "Singapore",
    "Shanghai",
    "Beijing",
    "Shenzhen",
    "Guangzhou",
    "Hangzhou",
    "Chengdu",
    "Wuhan"
];
const SECTION_PATTERNS = {
    education: /(教育经历|教育背景|Education)/i,
    experience: /(工作经历|工作经验|Experience|Employment)/i,
    skills: /(技能|专业技能|Skill|Tech Stack)/i,
    projects: /(项目经历|项目经验|Project)/i
};
function linesOf(text) {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}
function getLikelyName(text) {
    const lines = linesOf(text).slice(0, 8);
    return (lines.find((line) => {
        if (line.length < 2 || line.length > 30) {
            return false;
        }
        if (/@|电话|手机|邮箱|resume|curriculum|求职|简历/i.test(line)) {
            return false;
        }
        return /^[\p{Script=Han}A-Za-z .·-]+$/u.test(line);
    }) ?? "");
}
function getBasicInfo(text) {
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
    const phone = text.match(/(?:\+?\d{1,3}[-\s]?)?(?:1[3-9]\d{9}|\d{3}[-\s]?\d{3}[-\s]?\d{4})/)?.[0] ?? "";
    const city = CITY_LIBRARY.find((item) => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)) ?? "";
    return {
        name: getLikelyName(text),
        phone,
        email,
        city
    };
}
function collectSection(text, pattern) {
    const blocks = text.split(/\n(?=(?:[^\n]{1,40})\n)/g);
    const startIndex = blocks.findIndex((block) => pattern.test(block));
    if (startIndex === -1) {
        return "";
    }
    return blocks
        .slice(startIndex, startIndex + 4)
        .join("\n")
        .replace(pattern, "")
        .trim();
}
function chunkBlocks(section) {
    return section
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);
}
function inferDegree(block) {
    const match = block.match(/博士|Ph\.?D|硕士|Master|本科|Bachelor|大专|Associate|高中/i)?.[0] ?? "";
    return match;
}
function inferGraduationTime(block) {
    return block.match(/\b(20\d{2}|19\d{2})(?:[./-](0?[1-9]|1[0-2]))?\b/g)?.join(" - ") ?? "";
}
function getEducations(text) {
    const section = collectSection(text, SECTION_PATTERNS.education);
    const blocks = chunkBlocks(section);
    return blocks
        .map((block) => {
        const lines = linesOf(block);
        const school = lines.find((line) => /(大学|学院|University|College|Institute)/i.test(line)) ?? lines[0] ?? "";
        const major = lines.find((line) => /(专业|major|computer|software|data|design|engineering|金融|数学|统计)/i.test(line)) ??
            "";
        return {
            school,
            major,
            degree: inferDegree(block),
            graduationTime: inferGraduationTime(block)
        };
    })
        .filter((item) => item.school || item.major || item.degree);
}
function summarizeBlock(block) {
    return block
        .replace(/\s+/g, " ")
        .slice(0, 220)
        .trim();
}
function getExperiences(text) {
    const section = collectSection(text, SECTION_PATTERNS.experience);
    const blocks = chunkBlocks(section);
    return blocks
        .map((block) => {
        const lines = linesOf(block);
        const headline = lines[0] ?? "";
        const period = block.match(/\b(20\d{2}|19\d{2})[./-]?(0?[1-9]|1[0-2])?.{0,10}(至今|Present|20\d{2}|19\d{2})?/i)?.[0] ?? "";
        const companyName = lines.find((line) => /(公司|科技|集团|有限公司|Inc|Ltd|LLC|Corp|Studio|科技|网络|University)/i.test(line)) ??
            headline.split(/[-|｜·]/)[0] ??
            headline;
        const title = lines.find((line) => /(工程师|经理|开发|设计|运营|分析师|Architect|Engineer|Manager|Developer|Designer|Lead)/i.test(line)) ??
            headline.split(/[-|｜·]/)[1] ??
            "";
        return {
            companyName: companyName.trim(),
            title: title.trim(),
            period,
            summary: summarizeBlock(block)
        };
    })
        .filter((item) => item.companyName || item.title || item.period);
}
function getProjects(text) {
    const section = collectSection(text, SECTION_PATTERNS.projects);
    const blocks = chunkBlocks(section);
    return blocks
        .slice(0, 6)
        .map((block) => {
        const lines = linesOf(block);
        const name = lines[0] ?? "";
        const techLine = lines.find((line) => /(技术|stack|tech|使用|tools)/i.test(line)) ?? "";
        const responsibility = lines.slice(1, 4).join(" ");
        return {
            name,
            techStack: splitCommaValues(techLine.replace(/^[^:：]+[:：]/, "")),
            responsibility,
            highlights: summarizeBlock(block)
        };
    })
        .filter((item) => item.name);
}
function getSkills(text) {
    const section = collectSection(text, SECTION_PATTERNS.skills);
    const normalizedText = normalizeKeyword(`${section}\n${text}`);
    const directSectionSkills = uniqueStrings(section
        .split("\n")
        .flatMap((line) => splitCommaValues(line))
        .map((item) => item.trim()));
    const librarySkills = SKILL_LIBRARY.filter((skill) => normalizedText.includes(normalizeKeyword(skill)));
    return uniqueStrings([...directSectionSkills, ...librarySkills]).slice(0, 24);
}
export function extractResumeHeuristically(text) {
    return {
        basicInfo: getBasicInfo(text),
        educations: getEducations(text),
        experiences: getExperiences(text),
        skills: getSkills(text),
        projects: getProjects(text)
    };
}
