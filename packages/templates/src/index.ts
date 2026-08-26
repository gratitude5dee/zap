/** Zap runtime template manifests. Skeleton at Z0; session B/E/F fill the templates. */
export interface TemplateManifest {
  name: string;
  weight: "light" | "med" | "heavy";
  description: string;
  harness?: string;
  units: readonly string[];
  skills: readonly string[];
}

export const templates: readonly TemplateManifest[] = [
  {
    name: "zap-light",
    weight: "light",
    description: "CPU sandbox, files, code, browser, APIs, ffmpeg.",
    units: ["zap-agentd.service"],
    skills: [],
  },
  {
    name: "zap-med",
    weight: "med",
    description: "zap-light plus gateway, media FS, and ffmpeg presets.",
    units: ["zap-agentd.service"],
    skills: [],
  },
  {
    name: "zap-heavy",
    weight: "heavy",
    description: "zap-med plus memory, API/skills stores, and named harnesses.",
    units: ["zap-agentd.service", "zap-openviking.service"],
    skills: [],
  },
];

export function getTemplate(name: string): TemplateManifest | undefined {
  return templates.find((template) => template.name === name);
}
