/**
 * Same underlying product/story fingerprint — tighter than title normalization.
 */
export function extractProductFingerprint(title: string, text = '', sourceUrl = ''): string {
  const hay = `${title} ${text} ${sourceUrl}`.toLowerCase();
  if (/speedo\s+iq|vanquisher|smart\s+goggles?\s+module/i.test(hay)) return 'speedo-iq-vanquisher';
  if (/milan\s+smart\s+glasses/i.test(hay)) return 'milan-smart-glasses';
  if (/summit\s+plus|actbest\s+summit/i.test(hay)) return 'summit-plus-ebike';
  return '';
}
