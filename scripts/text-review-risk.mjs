/** Candidate wording for human review, never an automated compliance decision. */
const candidateTerms =
  /(?:死亡|血腥|血液|屠|虐待|绝望|末日|毁灭|尸潮|兽潮|猎杀|清剿|杀戮|尸群|感染者|感染体|肃清|受伤)/u;

export function reviewPriority(text) {
  return candidateTerms.test(text) ? "重点复核" : "常规核对";
}
