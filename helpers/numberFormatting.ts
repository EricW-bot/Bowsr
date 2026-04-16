export function roundToTwoDecimalPlaces(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return trimmed;
  }

  // EPSILON avoids floating precision artifacts (e.g. 1.005).
  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  return String(rounded);
}

