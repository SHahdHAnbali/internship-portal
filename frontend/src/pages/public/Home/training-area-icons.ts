import {
  BadgeCheck,
  BrainCircuit,
  Briefcase,
  ChartColumn,
  Cloud,
  Cpu,
  Gamepad2,
  GraduationCap,
  Layers,
  LayoutTemplate,
  Megaphone,
  Network,
  PenTool,
  Server,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';

// A recognisable icon for a training area, chosen from words in its real
// title (HR names each internship freely). Presentation only: it never
// adds, hides or describes an area. More specific matches come first.
const RULES: [RegExp, LucideIcon][] = [
  [/full[\s-]?stack/i, Layers],
  [/front[\s-]?end|\bweb\b|react|angular|\bvue\b/i, LayoutTemplate],
  [/back[\s-]?end|\bapi\b|server|node|\bjava\b|\.net|php|python|django|laravel/i, Server],
  [/mobile|android|\bios\b|flutter|kotlin|swift/i, Smartphone],
  [/machine learning|\bml\b|\bai\b|artificial intelligence|deep learning/i, BrainCircuit],
  [/data|analytic|\bbi\b|business intelligence|statistic/i, ChartColumn],
  [/\bui\b|\bux\b|design|graphic/i, PenTool],
  [/secur|cyber|penetration/i, ShieldCheck],
  [/cloud|devops|infrastructure|\bsre\b/i, Cloud],
  [/\bqa\b|quality|test/i, BadgeCheck],
  [/network|system admin|it support|helpdesk/i, Network],
  [/embedded|iot|hardware|robot|electronic/i, Cpu],
  [/game/i, Gamepad2],
  [/marketing|\bseo\b|content|social media/i, Megaphone],
  [/human resources|\bhr\b|account|finance|business|project manag/i, Briefcase],
];

export function trainingAreaIcon(title: string): LucideIcon {
  return RULES.find(([pattern]) => pattern.test(title))?.[1] ?? GraduationCap;
}
