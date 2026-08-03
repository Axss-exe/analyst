import { generateWithAI } from "./client";
import { estimateTokens } from "./token-counter";

export async function evaluateSourceConfidence(
  text: string,
  sourceType: string,
  source: string,
): Promise<{ score: number; reasoning: string; factors: string[] }> {
  // Sample first 10,000 chars for confidence eval
  const sample = text.slice(0, 10000);
  console.log(
    `[confidence] Processing sample of ${estimateTokens(sample)} tokens`,
  );

  const prompt = `Evaluate the reliability and confidence level of the following intelligence source.

Source Type: ${sourceType}
Source: ${source}
Text Sample:
${sample}

Analyze the following factors and respond in this exact JSON format:
{
  "score": 0.75,
  "reasoning": "Brief explanation of the confidence assessment",
  "factors": [
    "Factor 1: description",
    "Factor 2: description"
  ]
}

Confidence scoring guide:
- 0.9-1.0: Official government document, audited financial report, primary source with verifiable data
- 0.7-0.89: Reputable news outlet, established NGO report, academic research
- 0.5-0.69: Industry analysis, think tank report, secondary source with some citations
- 0.3-0.49: Blog post, social media, unverified claim, analyst note without sources
- 0.0-0.29: Rumor, anonymous source, clearly biased source, fabricated content indicators

Consider:
1. Source authority (official > reputable media > unknown)
2. Presence of specific data (names, dates, figures, locations)
3. Internal consistency and logical coherence
4. Corroboration potential (can facts be independently verified?)
5. Attribution (named authors vs anonymous)
6. Currency (recent vs outdated)
7. Bias indicators (emotional language, unsupported claims)

Only output valid JSON.`;

  const response = await generateWithAI(prompt, {
    systemPrompt:
      "You are an intelligence source reliability analyst. Be conservative. Require strong evidence for high scores.",
    temperature: 0.1,
    maxTokens: 1024,
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: Math.max(0, Math.min(1, parsed.score || 0.5)),
        reasoning: parsed.reasoning || "No detailed reasoning available",
        factors: Array.isArray(parsed.factors) ? parsed.factors : [],
      };
    }
  } catch {
    // fall through
  }

  const typeScores: Record<string, number> = {
    government: 0.85,
    report: 0.75,
    pdf: 0.7,
    word: 0.65,
    news: 0.6,
    website: 0.5,
    image: 0.4,
    analyst_note: 0.45,
  };
  const fallbackScore = typeScores[sourceType] || 0.5;

  return {
    score: fallbackScore,
    reasoning: `Fallback assessment based on source type "${sourceType}". AI evaluation failed.`,
    factors: [
      `Source type "${sourceType}" assigned baseline score of ${fallbackScore}`,
    ],
  };
}
