export function isValidIsbn13(s: string): boolean {
  return /^\d{13}$/.test(s) && (s.startsWith("978") || s.startsWith("979"));
}

export function isValidIsbn10(s: string): boolean {
  return /^\d{9}[\dX]$/.test(s);
}
