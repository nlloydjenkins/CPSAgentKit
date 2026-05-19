// Judge provider interfaces + the no-op `none` provider.
import type {
  JudgeEvaluationInput,
  JudgeEvaluationResult,
  JudgeProvider,
} from "./types.js";

export class NoneJudgeProvider implements JudgeProvider {
  async evaluate(_input: JudgeEvaluationInput): Promise<JudgeEvaluationResult> {
    return {
      overallScore: 0,
      passed: true,
      criteria: [],
      findings: [],
      inconclusiveReason: "Judge disabled (provider=none).",
    };
  }
}
