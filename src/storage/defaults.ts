export interface SeedCategory {
  nameEn: string;
  nameZh: string;
  color: string;
}

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { nameEn: "Project work", nameZh: "项目开发", color: "#5b8def" },
  { nameEn: "Meetings", nameZh: "会议沟通", color: "#e0a03a" },
  { nameEn: "Administration", nameZh: "行政事务", color: "#7f8c9a" },
  { nameEn: "Learning", nameZh: "学习成长", color: "#4bb37a" },
];
