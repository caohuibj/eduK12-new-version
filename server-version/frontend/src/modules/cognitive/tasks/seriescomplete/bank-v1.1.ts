/** Project-original 1.1.0 items; explicit rules/assumptions, no normed difficulty. */
export const SERIESCOMPLETE_STIMULUS_SET_VERSION = 'seriescomplete-zh-v1.1.0'
export type SeriescompleteItem = {id:string; band:1|2|3; stem:string; options:[string,string,string,string]; answer:0|1|2|3; explanation:string}
export const SERIESCOMPLETE_BANK: SeriescompleteItem[] = [
  {
    "id": "sc11-01",
    "band": 1,
    "stem": "2, 4, 6, 8, ?",
    "options": [
      "10",
      "9",
      "12",
      "16"
    ],
    "answer": 0,
    "explanation": "每次加2，所以应选 10。"
  },
  {
    "id": "sc11-02",
    "band": 1,
    "stem": "1, 3, 5, 7, ?",
    "options": [
      "9",
      "10",
      "11",
      "8"
    ],
    "answer": 0,
    "explanation": "每次加2，所以应选 9。"
  },
  {
    "id": "sc11-03",
    "band": 1,
    "stem": "5, 10, 15, 20, ?",
    "options": [
      "35",
      "40",
      "30",
      "25"
    ],
    "answer": 3,
    "explanation": "每次加5，所以应选 25。"
  },
  {
    "id": "sc11-04",
    "band": 1,
    "stem": "20, 18, 16, 14, ?",
    "options": [
      "10",
      "13",
      "12",
      "11"
    ],
    "answer": 2,
    "explanation": "每次减2，所以应选 12。"
  },
  {
    "id": "sc11-05",
    "band": 2,
    "stem": "1, 2, 4, 8, ?",
    "options": [
      "12",
      "14",
      "16",
      "32"
    ],
    "answer": 2,
    "explanation": "每次乘2，所以应选 16。"
  },
  {
    "id": "sc11-06",
    "band": 2,
    "stem": "3, 6, 12, 24, ?",
    "options": [
      "36",
      "48",
      "96",
      "30"
    ],
    "answer": 1,
    "explanation": "每次乘2，所以应选 48。"
  },
  {
    "id": "sc11-07",
    "band": 2,
    "stem": "1, 4, 9, 16, ?",
    "options": [
      "25",
      "36",
      "20",
      "24"
    ],
    "answer": 0,
    "explanation": "依次为正整数的平方，所以应选 25。"
  },
  {
    "id": "sc11-08",
    "band": 2,
    "stem": "2, 5, 10, 17, ?",
    "options": [
      "28",
      "24",
      "25",
      "26"
    ],
    "answer": 3,
    "explanation": "依次为正整数的平方加1，所以应选 26。"
  },
  {
    "id": "sc11-09",
    "band": 3,
    "stem": "1, 1, 2, 3, 5, ?",
    "options": [
      "6",
      "7",
      "8",
      "13"
    ],
    "answer": 2,
    "explanation": "从第三项起，每项是前两项之和，所以应选 8。"
  },
  {
    "id": "sc11-10",
    "band": 2,
    "stem": "81, 27, 9, 3, ?",
    "options": [
      "1",
      "2",
      "3",
      "0"
    ],
    "answer": 0,
    "explanation": "每次除以3，所以应选 1。"
  },
  {
    "id": "sc11-11",
    "band": 1,
    "stem": "100, 90, 80, 70, ?",
    "options": [
      "60",
      "65",
      "50",
      "55"
    ],
    "answer": 0,
    "explanation": "每次减10，所以应选 60。"
  },
  {
    "id": "sc11-12",
    "band": 3,
    "stem": "2, 3, 5, 7, 11, ?",
    "options": [
      "15",
      "12",
      "13",
      "14"
    ],
    "answer": 2,
    "explanation": "依次为从2开始的质数，所以应选 13。"
  },
  {
    "id": "sc11-13",
    "band": 1,
    "stem": "A, C, E, G, ?",
    "options": [
      "H",
      "I",
      "J",
      "K"
    ],
    "answer": 1,
    "explanation": "按英文字母顺序每次前进2位，所以应选 I。"
  },
  {
    "id": "sc11-14",
    "band": 2,
    "stem": "B, D, F, H, ?",
    "options": [
      "J",
      "K",
      "L",
      "I"
    ],
    "answer": 0,
    "explanation": "按英文字母顺序每次前进2位，所以应选 J。"
  },
  {
    "id": "sc11-15",
    "band": 1,
    "stem": "Z, Y, X, W, ?",
    "options": [
      "T",
      "S",
      "U",
      "V"
    ],
    "answer": 3,
    "explanation": "按英文字母顺序每次后退1位，所以应选 V。"
  },
  {
    "id": "sc11-16",
    "band": 3,
    "stem": "A, B, D, E, ?",
    "options": [
      "I",
      "F",
      "G",
      "H"
    ],
    "answer": 2,
    "explanation": "字母位次交替加1、加2，所以应选 G。"
  },
  {
    "id": "sc11-17",
    "band": 2,
    "stem": "C, F, I, L, ?",
    "options": [
      "M",
      "N",
      "O",
      "P"
    ],
    "answer": 2,
    "explanation": "按英文字母顺序每次前进3位，所以应选 O。"
  },
  {
    "id": "sc11-18",
    "band": 3,
    "stem": "1, 3, 6, 10, 15, ?",
    "options": [
      "20",
      "21",
      "25",
      "18"
    ],
    "answer": 1,
    "explanation": "相邻差依次为2、3、4、5、6，所以应选 21。"
  },
  {
    "id": "sc11-19",
    "band": 3,
    "stem": "2, 6, 18, 54, ?",
    "options": [
      "216",
      "270",
      "108",
      "162"
    ],
    "answer": 3,
    "explanation": "每次乘3，所以应选 162。"
  },
  {
    "id": "sc11-20",
    "band": 3,
    "stem": "1, 8, 27, 64, ?",
    "options": [
      "216",
      "100",
      "121",
      "125"
    ],
    "answer": 3,
    "explanation": "依次为正整数的立方，所以应选 125。"
  },
  {
    "id": "sc11-21",
    "band": 3,
    "stem": "A, Z, B, Y, C, X, ?",
    "options": [
      "W",
      "D",
      "E",
      "V"
    ],
    "answer": 1,
    "explanation": "奇数位置字母从A递增，偶数位置从Z递减，所以应选 D。"
  },
  {
    "id": "sc11-22",
    "band": 3,
    "stem": "3, 4, 6, 9, 13, ?",
    "options": [
      "15",
      "17",
      "18",
      "14"
    ],
    "answer": 2,
    "explanation": "相邻差依次为1、2、3、4、5，所以应选 18。"
  },
  {
    "id": "sc11-23",
    "band": 2,
    "stem": "5, 7, 11, 13, ?",
    "options": [
      "16",
      "17",
      "14",
      "15"
    ],
    "answer": 1,
    "explanation": "依次为从5开始的质数，所以应选 17。"
  },
  {
    "id": "sc11-24",
    "band": 3,
    "stem": "2, 4, 12, 48, ?",
    "options": [
      "480",
      "96",
      "144",
      "240"
    ],
    "answer": 3,
    "explanation": "依次乘以2、3、4、5，所以应选 240。"
  },
  {
    "id": "sc11-25",
    "band": 3,
    "stem": "10, 7, 8, 5, 6, ?",
    "options": [
      "2",
      "3",
      "4",
      "7"
    ],
    "answer": 1,
    "explanation": "交替减3、加1，下一项为 3。"
  },
  {
    "id": "sc11-26",
    "band": 3,
    "stem": "4, 9, 6, 11, 8, ?",
    "options": [
      "12",
      "13",
      "15",
      "10"
    ],
    "answer": 1,
    "explanation": "奇数位置从4每次加2，偶数位置从9每次加2，下一项为 13。"
  },
  {
    "id": "sc11-27",
    "band": 3,
    "stem": "2, 5, 11, 23, ?",
    "options": [
      "46",
      "47",
      "35",
      "45"
    ],
    "answer": 1,
    "explanation": "每项为前项乘2再加1，下一项为 47。"
  },
  {
    "id": "sc11-28",
    "band": 3,
    "stem": "100, 49, 23.5, 10.75, ?",
    "options": [
      "3.375",
      "4.375",
      "5.375",
      "4.75"
    ],
    "answer": 1,
    "explanation": "每项为前项除以2再减1，下一项为 4.375。"
  },
  {
    "id": "sc11-29",
    "band": 3,
    "stem": "1, 2, 6, 24, ?",
    "options": [
      "48",
      "96",
      "120",
      "144"
    ],
    "answer": 2,
    "explanation": "依次为1!、2!、3!、4!、5!，下一项为 120。"
  },
  {
    "id": "sc11-30",
    "band": 3,
    "stem": "1/2, 2/3, 3/4, 4/5, ?",
    "options": [
      "5/6",
      "5/7",
      "6/7",
      "4/6"
    ],
    "answer": 0,
    "explanation": "分子和分母各加1，下一项为 5/6。"
  },
  {
    "id": "sc11-31",
    "band": 3,
    "stem": "0.5, 1.5, 4.5, 13.5, ?",
    "options": [
      "40.5",
      "54",
      "27",
      "30.5"
    ],
    "answer": 0,
    "explanation": "每次乘3，下一项为 40.5。"
  },
  {
    "id": "sc11-32",
    "band": 3,
    "stem": "1, -2, 3, -4, ?",
    "options": [
      "-6",
      "-5",
      "5",
      "6"
    ],
    "answer": 2,
    "explanation": "绝对值依次加1，正负交替，下一项为 5。"
  },
  {
    "id": "sc11-33",
    "band": 3,
    "stem": "12, 21, 13, 31, 14, ?",
    "options": [
      "24",
      "32",
      "41",
      "42"
    ],
    "answer": 2,
    "explanation": "两项一组：首项从12递增1，第二项交换首项的十位与个位，下一项为 41。"
  },
  {
    "id": "sc11-34",
    "band": 3,
    "stem": "2, 3, 6, 11, 18, ?",
    "options": [
      "26",
      "28",
      "27",
      "25"
    ],
    "answer": 2,
    "explanation": "相邻差依次为1、3、5、7、9，下一项为 27。"
  },
  {
    "id": "sc11-35",
    "band": 3,
    "stem": "3, 8, 15, 24, ?",
    "options": [
      "33",
      "36",
      "35",
      "32"
    ],
    "answer": 2,
    "explanation": "依次为2²−1、3²−1、4²−1、5²−1、6²−1，下一项为 35。"
  },
  {
    "id": "sc11-36",
    "band": 3,
    "stem": "1, 4, 2, 8, 3, 12, ?",
    "options": [
      "6",
      "16",
      "4",
      "5"
    ],
    "answer": 2,
    "explanation": "两项一组：首项依次为1、2、3、4，第二项是首项的4倍，下一项为 4。"
  }
]
