/**
 * Internal DRAFT Chinese series-completion bank (seriescomplete-zh-v1.0.0).
 * Original items authored for this pilot; each answerIndex verified by hand.
 * 类型：等差、等比、平方/立方、斐波那契、字母跳字、交替、复合。
 */
export const SERIESCOMPLETE_STIMULUS_SET_VERSION = 'seriescomplete-zh-v1.0.0'

export type SeriescompleteItem = {
  id: string
  band: 1 | 2 | 3
  stem: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
}

export const SERIESCOMPLETE_BANK: SeriescompleteItem[] = [
  { id: 'sc-01', band: 1, stem: '2, 4, 6, 8, ?', options: ['10', '9', '12', '16'], answer: 0 },
  { id: 'sc-02', band: 1, stem: '1, 3, 5, 7, ?', options: ['8', '9', '10', '11'], answer: 1 },
  { id: 'sc-03', band: 1, stem: '5, 10, 15, 20, ?', options: ['30', '25', '35', '40'], answer: 1 },
  { id: 'sc-04', band: 1, stem: '20, 18, 16, 14, ?', options: ['13', '12', '11', '10'], answer: 1 },
  { id: 'sc-05', band: 2, stem: '1, 2, 4, 8, ?', options: ['12', '14', '16', '32'], answer: 2 },
  { id: 'sc-06', band: 2, stem: '3, 6, 12, 24, ?', options: ['30', '36', '48', '96'], answer: 2 },
  { id: 'sc-07', band: 2, stem: '1, 4, 9, 16, ?', options: ['20', '24', '25', '36'], answer: 2 },
  { id: 'sc-08', band: 2, stem: '2, 5, 10, 17, ?', options: ['24', '25', '26', '28'], answer: 2 },
  { id: 'sc-09', band: 3, stem: '1, 1, 2, 3, 5, ?', options: ['6', '7', '8', '13'], answer: 2 },
  { id: 'sc-10', band: 2, stem: '81, 27, 9, 3, ?', options: ['0', '1', '2', '3'], answer: 1 },
  { id: 'sc-11', band: 1, stem: '100, 90, 80, 70, ?', options: ['50', '55', '60', '65'], answer: 2 },
  { id: 'sc-12', band: 3, stem: '2, 3, 5, 7, 11, ?', options: ['12', '13', '14', '15'], answer: 1 },
  { id: 'sc-13', band: 1, stem: 'A, C, E, G, ?', options: ['H', 'I', 'J', 'K'], answer: 1 },
  { id: 'sc-14', band: 2, stem: 'B, D, F, H, ?', options: ['I', 'J', 'K', 'L'], answer: 1 },
  { id: 'sc-15', band: 1, stem: 'Z, Y, X, W, ?', options: ['U', 'V', 'T', 'S'], answer: 1 },
  { id: 'sc-16', band: 3, stem: 'A, B, D, E, ?', options: ['F', 'G', 'H', 'I'], answer: 1 },
  { id: 'sc-17', band: 2, stem: 'C, F, I, L, ?', options: ['M', 'N', 'O', 'P'], answer: 2 },
  { id: 'sc-18', band: 3, stem: '1, 3, 6, 10, 15, ?', options: ['18', '20', '21', '25'], answer: 2 },
  { id: 'sc-19', band: 3, stem: '2, 6, 18, 54, ?', options: ['108', '162', '216', '270'], answer: 1 },
  { id: 'sc-20', band: 3, stem: '1, 8, 27, 64, ?', options: ['100', '121', '125', '216'], answer: 2 },
  { id: 'sc-21', band: 3, stem: 'A, Z, B, Y, C, X, ?', options: ['W', 'D', 'E', 'V'], answer: 1 },
  { id: 'sc-22', band: 3, stem: '3, 4, 6, 9, 13, ?', options: ['14', '15', '17', '18'], answer: 3 },
  { id: 'sc-23', band: 2, stem: '5, 7, 11, 13, ?', options: ['14', '15', '16', '17'], answer: 3 },
  { id: 'sc-24', band: 3, stem: '2, 4, 12, 48, ?', options: ['96', '144', '240', '480'], answer: 2 },
]
