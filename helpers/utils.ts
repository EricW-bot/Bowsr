import { DEFAULT_FUEL_TYPE } from '../constants';

export const getErrorMessage = (err: unknown, fallback: string): string => {
  return err instanceof Error ? err.message : fallback;
};

export const normaliseFuelType = (value: string): string => {
  const normalise = value.trim().toUpperCase();
  return normalise || DEFAULT_FUEL_TYPE;
};

export const normaliseBrands = (brands: string[]): string[] => {
  return brands.map((brand) => brand.trim()).filter((brand) => brand.length > 0);
};

export const sameOrderedStringArray = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};
