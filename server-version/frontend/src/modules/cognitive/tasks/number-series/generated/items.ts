/** Original project items. No ICAR, Wechsler or Raven item text/assets used. */
export const FAMILIES = ['addition', 'multiplication', 'growing-gap'] as const
export type Family = typeof FAMILIES[number]
export interface NumberSeriesItem {
  id: string; family: Family; known: readonly [number, number, number, number]; answer: number
  distractors: readonly { value: number; reason: string }[]; short: boolean
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}
export const BANK_VERSION = 'original-number-series-bank-0.1.0'
export const BANK_HASH = '017995379001d7aa202f13fc52425520df43e2383a8e7012d7f02e37bd853292'
export const ITEMS: readonly NumberSeriesItem[] = freeze([
  {
    "id": "ns-a01",
    "family": "addition",
    "known": [
      2,
      5,
      8,
      11
    ],
    "answer": 14,
    "distractors": [
      {
        "value": 11,
        "reason": "repeat-last"
      },
      {
        "value": 17,
        "reason": "extra-step"
      },
      {
        "value": 13,
        "reason": "arithmetic-slip"
      }
    ],
    "short": true
  },
  {
    "id": "ns-a02",
    "family": "addition",
    "known": [
      5,
      9,
      13,
      17
    ],
    "answer": 21,
    "distractors": [
      {
        "value": 17,
        "reason": "repeat-last"
      },
      {
        "value": 25,
        "reason": "extra-step"
      },
      {
        "value": 20,
        "reason": "arithmetic-slip"
      }
    ],
    "short": true
  },
  {
    "id": "ns-a03",
    "family": "addition",
    "known": [
      11,
      13,
      15,
      17
    ],
    "answer": 19,
    "distractors": [
      {
        "value": 17,
        "reason": "repeat-last"
      },
      {
        "value": 21,
        "reason": "extra-step"
      },
      {
        "value": 18,
        "reason": "arithmetic-slip"
      }
    ],
    "short": true
  },
  {
    "id": "ns-a04",
    "family": "addition",
    "known": [
      7,
      12,
      17,
      22
    ],
    "answer": 27,
    "distractors": [
      {
        "value": 22,
        "reason": "repeat-last"
      },
      {
        "value": 32,
        "reason": "extra-step"
      },
      {
        "value": 26,
        "reason": "arithmetic-slip"
      }
    ],
    "short": true
  },
  {
    "id": "ns-a05",
    "family": "addition",
    "known": [
      6,
      7,
      8,
      9
    ],
    "answer": 10,
    "distractors": [
      {
        "value": 9,
        "reason": "repeat-last"
      },
      {
        "value": 11,
        "reason": "extra-step"
      },
      {
        "value": 12,
        "reason": "arithmetic-slip"
      }
    ],
    "short": false
  },
  {
    "id": "ns-a06",
    "family": "addition",
    "known": [
      13,
      16,
      19,
      22
    ],
    "answer": 25,
    "distractors": [
      {
        "value": 22,
        "reason": "repeat-last"
      },
      {
        "value": 28,
        "reason": "extra-step"
      },
      {
        "value": 24,
        "reason": "arithmetic-slip"
      }
    ],
    "short": false
  },
  {
    "id": "ns-a07",
    "family": "addition",
    "known": [
      18,
      22,
      26,
      30
    ],
    "answer": 34,
    "distractors": [
      {
        "value": 30,
        "reason": "repeat-last"
      },
      {
        "value": 38,
        "reason": "extra-step"
      },
      {
        "value": 33,
        "reason": "arithmetic-slip"
      }
    ],
    "short": false
  },
  {
    "id": "ns-a08",
    "family": "addition",
    "known": [
      21,
      23,
      25,
      27
    ],
    "answer": 29,
    "distractors": [
      {
        "value": 27,
        "reason": "repeat-last"
      },
      {
        "value": 31,
        "reason": "extra-step"
      },
      {
        "value": 28,
        "reason": "arithmetic-slip"
      }
    ],
    "short": false
  },
  {
    "id": "ns-m01",
    "family": "multiplication",
    "known": [
      2,
      4,
      8,
      16
    ],
    "answer": 32,
    "distractors": [
      {
        "value": 16,
        "reason": "repeat-last"
      },
      {
        "value": 18,
        "reason": "add-instead-of-multiply"
      },
      {
        "value": 34,
        "reason": "arithmetic-slip"
      }
    ],
    "short": true
  },
  {
    "id": "ns-m02",
    "family": "multiplication",
    "known": [
      3,
      6,
      12,
      24
    ],
    "answer": 48,
    "distractors": [
      {
        "value": 24,
        "reason": "repeat-last"
      },
      {
        "value": 26,
        "reason": "add-instead-of-multiply"
      },
      {
        "value": 50,
        "reason": "arithmetic-slip"
      }
    ],
    "short": false
  },
  {
    "id": "ns-m03",
    "family": "multiplication",
    "known": [
      4,
      8,
      16,
      32
    ],
    "answer": 64,
    "distractors": [
      {
        "value": 32,
        "reason": "repeat-last"
      },
      {
        "value": 34,
        "reason": "add-instead-of-multiply"
      },
      {
        "value": 66,
        "reason": "arithmetic-slip"
      }
    ],
    "short": true
  },
  {
    "id": "ns-m04",
    "family": "multiplication",
    "known": [
      5,
      10,
      20,
      40
    ],
    "answer": 80,
    "distractors": [
      {
        "value": 40,
        "reason": "repeat-last"
      },
      {
        "value": 42,
        "reason": "add-instead-of-multiply"
      },
      {
        "value": 82,
        "reason": "arithmetic-slip"
      }
    ],
    "short": false
  },
  {
    "id": "ns-m05",
    "family": "multiplication",
    "known": [
      6,
      12,
      24,
      48
    ],
    "answer": 96,
    "distractors": [
      {
        "value": 48,
        "reason": "repeat-last"
      },
      {
        "value": 50,
        "reason": "add-instead-of-multiply"
      },
      {
        "value": 98,
        "reason": "arithmetic-slip"
      }
    ],
    "short": true
  },
  {
    "id": "ns-m06",
    "family": "multiplication",
    "known": [
      7,
      14,
      28,
      56
    ],
    "answer": 112,
    "distractors": [
      {
        "value": 56,
        "reason": "repeat-last"
      },
      {
        "value": 58,
        "reason": "add-instead-of-multiply"
      },
      {
        "value": 114,
        "reason": "arithmetic-slip"
      }
    ],
    "short": false
  },
  {
    "id": "ns-m07",
    "family": "multiplication",
    "known": [
      8,
      16,
      32,
      64
    ],
    "answer": 128,
    "distractors": [
      {
        "value": 64,
        "reason": "repeat-last"
      },
      {
        "value": 66,
        "reason": "add-instead-of-multiply"
      },
      {
        "value": 130,
        "reason": "arithmetic-slip"
      }
    ],
    "short": false
  },
  {
    "id": "ns-m08",
    "family": "multiplication",
    "known": [
      1,
      3,
      9,
      27
    ],
    "answer": 81,
    "distractors": [
      {
        "value": 27,
        "reason": "repeat-last"
      },
      {
        "value": 30,
        "reason": "add-instead-of-multiply"
      },
      {
        "value": 84,
        "reason": "arithmetic-slip"
      }
    ],
    "short": true
  },
  {
    "id": "ns-g01",
    "family": "growing-gap",
    "known": [
      2,
      3,
      5,
      8
    ],
    "answer": 12,
    "distractors": [
      {
        "value": 11,
        "reason": "repeat-last-gap"
      },
      {
        "value": 8,
        "reason": "repeat-last"
      },
      {
        "value": 13,
        "reason": "increase-gap-twice"
      }
    ],
    "short": true
  },
  {
    "id": "ns-g02",
    "family": "growing-gap",
    "known": [
      3,
      5,
      8,
      12
    ],
    "answer": 17,
    "distractors": [
      {
        "value": 16,
        "reason": "repeat-last-gap"
      },
      {
        "value": 12,
        "reason": "repeat-last"
      },
      {
        "value": 18,
        "reason": "increase-gap-twice"
      }
    ],
    "short": true
  },
  {
    "id": "ns-g03",
    "family": "growing-gap",
    "known": [
      4,
      5,
      8,
      13
    ],
    "answer": 20,
    "distractors": [
      {
        "value": 18,
        "reason": "repeat-last-gap"
      },
      {
        "value": 13,
        "reason": "repeat-last"
      },
      {
        "value": 22,
        "reason": "increase-gap-twice"
      }
    ],
    "short": true
  },
  {
    "id": "ns-g04",
    "family": "growing-gap",
    "known": [
      6,
      9,
      13,
      18
    ],
    "answer": 24,
    "distractors": [
      {
        "value": 23,
        "reason": "repeat-last-gap"
      },
      {
        "value": 18,
        "reason": "repeat-last"
      },
      {
        "value": 25,
        "reason": "increase-gap-twice"
      }
    ],
    "short": true
  },
  {
    "id": "ns-g05",
    "family": "growing-gap",
    "known": [
      1,
      3,
      7,
      13
    ],
    "answer": 21,
    "distractors": [
      {
        "value": 19,
        "reason": "repeat-last-gap"
      },
      {
        "value": 13,
        "reason": "repeat-last"
      },
      {
        "value": 23,
        "reason": "increase-gap-twice"
      }
    ],
    "short": false
  },
  {
    "id": "ns-g06",
    "family": "growing-gap",
    "known": [
      7,
      8,
      12,
      19
    ],
    "answer": 29,
    "distractors": [
      {
        "value": 26,
        "reason": "repeat-last-gap"
      },
      {
        "value": 19,
        "reason": "repeat-last"
      },
      {
        "value": 32,
        "reason": "increase-gap-twice"
      }
    ],
    "short": false
  },
  {
    "id": "ns-g07",
    "family": "growing-gap",
    "known": [
      5,
      8,
      13,
      20
    ],
    "answer": 29,
    "distractors": [
      {
        "value": 27,
        "reason": "repeat-last-gap"
      },
      {
        "value": 20,
        "reason": "repeat-last"
      },
      {
        "value": 31,
        "reason": "increase-gap-twice"
      }
    ],
    "short": false
  },
  {
    "id": "ns-g08",
    "family": "growing-gap",
    "known": [
      9,
      11,
      16,
      24
    ],
    "answer": 35,
    "distractors": [
      {
        "value": 32,
        "reason": "repeat-last-gap"
      },
      {
        "value": 24,
        "reason": "repeat-last"
      },
      {
        "value": 38,
        "reason": "increase-gap-twice"
      }
    ],
    "short": false
  }
])

/** A defensible answer within the three taught model classes, not a unique mathematical continuation. */
export function predictions(known: readonly number[]): { family: Family; answer: number }[] {
  if (known.length !== 4 || known.some(n => !Number.isInteger(n) || n < 1 || n > 200)) throw Error('Invalid number row')
  const [a,b,c,d] = known, gaps = [b-a,c-b,d-c], found: { family: Family; answer: number }[] = []
  if (gaps[0] >= 1 && gaps[0] <= 5 && gaps.every(g => g === gaps[0])) found.push({family:'addition',answer:d+gaps[0]})
  for (const r of [2,3]) if (b===a*r && c===b*r && d===c*r) found.push({family:'multiplication',answer:d*r})
  const growth=gaps[1]-gaps[0]
  if (gaps[0]>=1 && gaps[0]<=3 && growth>=1 && growth<=3 && gaps[2]-gaps[1]===growth) found.push({family:'growing-gap',answer:d+gaps[2]+growth})
  return found
}
export function validateItems() {
  const ids=new Set<string>(), rows=new Set<string>()
  for (const item of ITEMS) {
    const p=predictions(item.known), values=[item.answer,...item.distractors.map(d=>d.value)], key=item.known.join(',')
    if(ids.has(item.id)||rows.has(key)||p.length!==1||p[0].family!==item.family||p[0].answer!==item.answer||values.length!==4||new Set(values).size!==4||values.some(n=>!Number.isInteger(n)||n<1||n>200)) throw Error('Ambiguous or malformed original item '+item.id)
    ids.add(item.id);rows.add(key)
  }
  for(const family of FAMILIES) if(ITEMS.filter(i=>i.family===family).length!==8||ITEMS.filter(i=>i.family===family&&i.short).length!==4) throw Error('Incorrect item coverage')
}
validateItems()
