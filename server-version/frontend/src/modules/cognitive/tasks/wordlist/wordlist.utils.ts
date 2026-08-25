export const normalizeWordlistResponse = (value: string): string => value
  .normalize('NFKC')
  .toLocaleLowerCase('en-US')
  .replace(/[\p{P}\p{S}]+/gu, '')
  .replace(/\s+/gu, '')
