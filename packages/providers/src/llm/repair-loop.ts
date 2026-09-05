export interface StructuredAttempt<T> {
  parsedOutput: T | null;
  errorSummary?: string;
}

export async function runStructuredWithRepair<T>(
  callOnce: (repairNote: string | undefined) => Promise<StructuredAttempt<T>>,
  maxRetries: number,
): Promise<T> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await callOnce(lastError);
    if (result.parsedOutput !== null) {
      return result.parsedOutput;
    }
    lastError = result.errorSummary ?? "Unbekannter Validierungsfehler";
  }

  throw new Error(
    `Structured output failed after ${maxRetries + 1} attempts: ${lastError}`,
  );
}
