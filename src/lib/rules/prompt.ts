/** The AI's one job for rules: map the trader's words to a supported rule, or null. */
export function rulePrompt(text: string) {
  return `A trader wrote one of their personal trading rules. Map it to exactly one supported rule, or null if it doesn't fit. Never invent a rule they didn't state.

Supported rules:
- {"kind":"maxTrades","params":{"max":integer}}  (most trades in one day)
- {"kind":"lossStreak","params":{"max":integer}}  (stop for the day after this many losses in a row)
- {"kind":"dailyLoss","params":{"amount":number,"unit":"money"|"r"}}  (stop for the day after losing this much; "r" for R multiples)
- {"kind":"noTrading","params":{"sessions":["Asian"|"London"|"New York"],"days":[0-6, 0=Sunday]}}

Percent-of-account limits, news rules and anything else: {"kind":null}.

Rule: """${text}"""

Return JSON only.`;
}
