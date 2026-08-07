import type { CoherenceScore, CoherenceDimensions } from "@/types";

interface CoherenceInputDoc {
  programs: string[];
  problems: string[];
  countries: string[];
  dates: string[];
  factCount: number;
}

export function computeCoherence(docs: CoherenceInputDoc[]): CoherenceScore {
  if (docs.length === 0) {
    return {
      overall: 0,
      dimensions: {
        programIdentity: 0,
        problemConsistency: 0,
        geographicConsistency: 0,
        temporalCoherence: 0,
        evidenceDensity: 0,
      },
      explanation: "Empty candidate",
    };
  }

  const allPrograms = docs.flatMap((d) => d.programs);
  const uniquePrograms = [...new Set(allPrograms)];
  const programIdentity =
    uniquePrograms.length > 0
      ? Math.min(
          1,
          allPrograms.length / (docs.length * uniquePrograms.length) +
            (uniquePrograms.length === 1 ? 0.3 : 0),
        )
      : 0;

  const allProblems = docs.flatMap((d) => d.problems);
  const uniqueProblems = [...new Set(allProblems)];
  const problemConsistency =
    uniqueProblems.length > 0
      ? Math.min(
          1,
          allProblems.length /
            (docs.length * Math.max(1, uniqueProblems.length)) +
            0.2,
        )
      : 0;

  const allCountries = docs.flatMap((d) => d.countries);
  const uniqueCountries = [...new Set(allCountries)];
  const geographicConsistency =
    uniqueCountries.length > 0
      ? Math.min(
          1,
          (1 / Math.max(1, uniqueCountries.length - 1)) * 0.5 + 0.5,
        )
      : 0;

  const dates = docs
    .map((d) => new Date(d.dates[0] || "2024-01-01").getTime())
    .filter((t) => !isNaN(t));
  const dateRange =
    dates.length > 1 ? Math.max(...dates) - Math.min(...dates) : 0;
  const temporalCoherence = Math.max(
    0,
    1 - dateRange / (365 * 24 * 60 * 60 * 1000 * 5),
  );

  const avgFacts =
    docs.reduce((sum, d) => sum + d.factCount, 0) / docs.length;
  const evidenceDensity = Math.min(1, avgFacts / 10);

  const overall =
    programIdentity * 0.3 +
    problemConsistency * 0.25 +
    geographicConsistency * 0.15 +
    temporalCoherence * 0.15 +
    evidenceDensity * 0.15;

  const dimensions: CoherenceDimensions = {
    programIdentity,
    problemConsistency,
    geographicConsistency,
    temporalCoherence,
    evidenceDensity,
  };

  return {
    overall,
    dimensions,
    explanation: `Program:${programIdentity.toFixed(2)} Problem:${problemConsistency.toFixed(2)} Geo:${geographicConsistency.toFixed(2)} Temporal:${temporalCoherence.toFixed(2)} Density:${evidenceDensity.toFixed(2)}`,
  };
}

export function validateSingleDocumentStory(doc: {
  id: number;
  internalProgramCount: number;
  internalCausalChains: number;
  internalProblemResponsePairs: number;
  evidenceDensity: number;
}): {
  evidenceIds: number[];
  coherence: number;
  isValid: boolean;
  rejectionReason?: string;
} {
  const hasInternalStructure =
    doc.internalProgramCount >= 1 ||
    doc.internalCausalChains >= 1 ||
    doc.internalProblemResponsePairs >= 1;

  const hasEvidenceDensity = doc.evidenceDensity >= 0.5;

  if (hasInternalStructure && hasEvidenceDensity) {
    return {
      evidenceIds: [doc.id],
      coherence:
        0.6 +
        doc.internalProgramCount * 0.1 +
        doc.internalCausalChains * 0.1,
      isValid: true,
    };
  }

  return {
    evidenceIds: [doc.id],
    coherence: 0.3,
    isValid: false,
    rejectionReason:
      "Insufficient internal narrative structure for single-document story",
  };
}
