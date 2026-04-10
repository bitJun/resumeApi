export type CandidateStatus =
  | "pending"
  | "shortlisted"
  | "interviewing"
  | "hired"
  | "rejected";

export type ExtractionStatus = "idle" | "processing" | "completed" | "failed";

export interface BasicInfo {
  name: string;
  phone: string;
  email: string;
  city: string;
}

export interface EducationItem {
  school: string;
  major: string;
  degree: string;
  graduationTime: string;
}

export interface ExperienceItem {
  companyName: string;
  title: string;
  period: string;
  summary: string;
}

export interface ProjectItem {
  name: string;
  techStack: string[];
  responsibility: string;
  highlights: string;
}

export interface ResumeExtraction {
  basicInfo: BasicInfo;
  educations: EducationItem[];
  experiences: ExperienceItem[];
  skills: string[];
  projects: ProjectItem[];
}

export interface CandidateRecord {
  id: string;
  originalName: string;
  storedName: string;
  filePath: string;
  fileSize: number;
  pageCount: number;
  uploadedAt: string;
  status: CandidateStatus;
  rawText: string;
  cleanText: string;
  extractionStatus: ExtractionStatus;
  extraction: ResumeExtraction;
  latestMatch: MatchRecord | null;
  matches: MatchRecord[];
}

export interface JobDescriptionRecord {
  id: string;
  title: string;
  description: string;
  mustSkills: string[];
  bonusSkills: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MatchBreakdown {
  matchedMustSkills: string[];
  matchedBonusSkills: string[];
  missingMustSkills: string[];
}

export interface MatchRecord {
  id: string;
  candidateId: string;
  jobId: string;
  overallScore: number;
  skillScore: number;
  experienceScore: number;
  educationScore: number;
  aiComment: string;
  breakdown: MatchBreakdown;
  createdAt: string;
  updatedAt: string;
}
