import sampleSource from "../../sample.ts?raw";

export interface DemoExample {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly code: string;
}

export const DEMO_EXAMPLES: readonly DemoExample[] = Object.freeze([
  {
    id: "basic",
    name: "1. Basic (sample.ts)",
    description: "Canonical branching sample: score classification with pass/review paths.",
    code: sampleSource.trim(),
  },
  {
    id: "dead-code",
    name: "2. Dead Code",
    description: "Compile-time false condition: body pruned and isolated as dead code.",
    code: `function checkStatus(flag: boolean) {
  if (false) {
    return "unreachable";
  }

  return "active";
}

checkStatus(true);`,
  },
  {
    id: "unsupported",
    name: "3. Unsupported",
    description: "Explicit uncertainty: reports UNSUPPORTED rather than inventing unmodeled paths.",
    code: `function evaluate(flag: boolean) {
  // Short-circuiting operator triggers explicit UNSUPPORTED state
  flag && console.log("side-effect");
  return flag;
}

evaluate(true);`,
  },
]);
