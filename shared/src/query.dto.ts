export interface QueryRequestDto {
  sessionId: string;
  database: string;
  naturalLanguage: string;
}

export interface QueryResponseDto {
  generatedQuery: string;
  explanation: string;
  result: Record<string, unknown>[];
  executionTimeMs: number;
}

export interface ListCollectionsRequestDto {
  sessionId: string;
  database: string;
}

export interface ListCollectionsResponseDto {
  collections: string[];
}
