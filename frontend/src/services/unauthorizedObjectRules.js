/**
 * Comprehensive Unauthorized Object Rules Engine
 * Supports: Phone, Tablet, Laptop, Second Monitor, Books/Notes, Headphones, and Custom Configurable Objects.
 */

export const DEFAULT_UNAUTHORIZED_RULES = [
  {
    id: "phone",
    name: "Smartphone / Mobile Phone",
    classes: ["cell phone", "phone"],
    icon: "Smartphone",
    enabled: true,
    severity: "critical",
    minConfidence: 0.45,
    riskPenalty: 40,
    description: "Mobile phones used for communication or cheating assistance.",
  },
  {
    id: "tablet",
    name: "Tablet / iPad",
    classes: ["tablet", "ipad"],
    icon: "Tablet",
    enabled: true,
    severity: "critical",
    minConfidence: 0.40,
    riskPenalty: 35,
    description: "Tablet or electronic slate in view.",
  },
  {
    id: "laptop",
    name: "Secondary Laptop",
    classes: ["laptop"],
    icon: "Laptop",
    enabled: true,
    severity: "critical",
    minConfidence: 0.45,
    riskPenalty: 45,
    description: "External laptop or secondary computer in frame.",
  },
  {
    id: "monitor",
    name: "Second Monitor / Display",
    classes: ["tv", "monitor", "screen"],
    icon: "Monitor",
    enabled: true,
    severity: "critical",
    minConfidence: 0.42,
    riskPenalty: 40,
    description: "Secondary screen or external display visible in background.",
  },
  {
    id: "books",
    name: "Books & Physical Notes",
    classes: ["book", "notes", "paper"],
    icon: "BookOpen",
    enabled: true,
    severity: "warning",
    minConfidence: 0.45,
    riskPenalty: 25,
    description: "Reference textbooks, study materials, or written notes.",
  },
  {
    id: "headphones",
    name: "Headphones & Earbuds",
    classes: ["headphones", "earbuds", "headset"],
    icon: "Headphones",
    enabled: true,
    severity: "warning",
    minConfidence: 0.40,
    riskPenalty: 25,
    description: "Audio devices worn to receive covert audio cues or coaching.",
  },
  {
    id: "remote",
    name: "Remote Controls & Clickers",
    classes: ["remote"],
    icon: "Radio",
    enabled: true,
    severity: "medium",
    minConfidence: 0.45,
    riskPenalty: 15,
    description: "Handheld clickers or presentation remotes.",
  },
];

/**
 * Normalizes raw COCO class to canonical interview entity
 */
export function normalizeObjectClass(rawClass) {
  const lc = (rawClass || "").toLowerCase().trim();
  if (lc === "tv") return "Second Monitor";
  if (lc === "cell phone") return "Cell Phone";
  if (lc === "laptop") return "Secondary Laptop";
  if (lc === "book") return "Book / Notes";
  if (lc === "remote") return "Remote Control";
  return rawClass;
}

/**
 * Matches a detected raw object against the active rules list
 */
export function evaluateObjectRule(rawClass, confidence, rules = DEFAULT_UNAUTHORIZED_RULES) {
  const lc = (rawClass || "").toLowerCase().trim();

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const matchesClass = rule.classes.some((c) => {
      const target = c.toLowerCase().trim();
      if (lc === target) return true;
      if (target === "phone" && lc.includes("headphone")) return false;
      return lc === target || lc.split(/\s+/).includes(target);
    });

    if (matchesClass && confidence >= rule.minConfidence) {
      return {
        matched: true,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        riskPenalty: rule.riskPenalty,
        description: rule.description,
        displayName: rule.name,
      };
    }
  }

  return {
    matched: false,
    ruleId: null,
    ruleName: null,
    severity: "idle",
    riskPenalty: 0,
    description: "Permitted background item",
    displayName: normalizeObjectClass(rawClass),
  };
}
