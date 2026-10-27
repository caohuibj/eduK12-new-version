import React from 'react'
import type {NumberSeriesConfig,NumberSeriesPlan} from './generated/protocol'
import type {Language} from './generated/report'
export function practiceExplanation(plan:NumberSeriesPlan,language:Language):string {
  const k=plan.known,en=language==='en'
  if(plan.family==='addition')return en?`Add ${k[1]-k[0]} each time. ${k[3]} + ${k[1]-k[0]} = ${plan.answer}.`:`每次加 ${k[1]-k[0]}，${k[3]} 再加 ${k[1]-k[0]} 是 ${plan.answer}。`
  if(plan.family==='multiplication')return en?`Multiply by ${k[1]/k[0]} each time. ${k[3]} × ${k[1]/k[0]} = ${plan.answer}.`:`每次乘 ${k[1]/k[0]}，${k[3]} × ${k[1]/k[0]} 是 ${plan.answer}。`
  const gaps=[k[1]-k[0],k[2]-k[1],k[3]-k[2]],next=plan.answer-k[3]
  return en?`The gaps are ${gaps.join(', ')}. The next gap is ${next}, so ${k[3]} + ${next} = ${plan.answer}.`:`增加量是 ${gaps.join('、')}，下一步加 ${next}，所以 ${k[3]} + ${next} 是 ${plan.answer}。`
}
export function NumberSeriesInstructions({config,language}:{config:NumberSeriesConfig;language:Language}) {
  const en=language==='en',short=config.profile==='experience'
  return <section aria-label={en?'Complete instructions and three examples':'完整说明与三个例子'}>
    <h1>{en?'Look at the changes, then choose the next number':'看懂变化，再选下一项'}</h1>
    <p>{en?'You will see a row of numbers ending in a question mark. Look at how neighbouring numbers change, then choose the next number from four options.':'接下来，你会看到一行数字，最后一个位置是问号。请看看相邻数字怎样变化，再从四个选项中选出最符合规律的下一个数字。'}</p>
    <div className="number-series-example"><h2>{en?'Example 1: add the same amount':'例子一：每次加同样多'}</h2><p className="number-series-digits">3 · 7 · 11 · 15 · ?</p><p>{en?'Add 4 each time. After 15, choose 19.':'每次加 4：3→7→11→15，所以下一个选 19。'}</p></div>
    <div className="number-series-example"><h2>{en?'Example 2: multiply by the same number':'例子二：每次乘同样的数'}</h2><p className="number-series-digits">2 · 6 · 18 · 54 · ?</p><p>{en?'Multiply by 3 each time. 54 × 3 = 162.':'每次乘 3，54 × 3 = 162，所以下一个选 162。'}</p></div>
    <div className="number-series-example"><h2>{en?'Example 3: gaps that grow step by step':'例子三：增加量一步步变大'}</h2><p className="number-series-digits">2 · 5 · 9 · 14 · ?</p><p>{en?'The gaps are 3, 4 and 5. The next gap is 6, so 14 + 6 = 20.':'先加 3，再加 4，再加 5。下一步加 6，14 + 6 = 20，所以下一个选 20。'}</p></div>
    <p>{en?'Formal questions mix the three types without naming the rule. The whole row stays visible. Take your time and think before choosing. Your first choice submits the answer and cannot be changed. You may choose “Skip this question” or end the activity.':'正式题会混合这三类关系，不会告诉你属于哪类。整行数字会一直留着，不用抢答，请先想清楚。点选即提交，不能回改；也可以选“这题先跳过”，或者结束任务。'}</p>
    <p>{en?'Tap or click one of the four large options. On a keyboard, use 1–4, or focus an option and press Enter or Space. Holding a key does not answer a new question. After a formal answer, press “Next question”; formal answers are not explained one by one.':'触控或鼠标点选下面四个大选项；键盘可按 1–4，或聚焦选项后按 Enter / 空格。按住不算下一题。正式题提交后点“下一题”继续，不会逐题公布答案。'}</p>
    <p>{en?'You may rest between groups of six questions. Work on your own, without a calculator or someone answering for you. If the rules feel unfamiliar or you feel uncomfortable, you may stop.':'每组 6 题后可以休息。请自己作答，不使用计算器，也不请别人代答；不熟悉或不舒服时可以退出。'}</p>
    <div className="number-series-practice-note"><h2>{en?'Three easier practice questions first':'先做三题较简单的练习'}</h2><p>{en?'One of each type, with smaller numbers, no time limit and an explanation after each question. All 3 must be completed correctly to continue. A wrong answer, skip or unfinished question means reviewing these complete instructions and all three examples before another round. At most 3 rounds; you may stop. Practice never enters the formal result.':'三类各一题，数字较小、不限时、每题解释。3/3 完成且答对后继续；答错、跳过或未完成，先完整重看本说明和全部三个例子，再练一组。最多 3 轮，可退出；练习不进入正式结果。'}</p></div>
    <p>{en?`${short?'Experience':'Research'}: ${config.totalItems} formal questions, ${config.itemsPerCondition} of each type; about ${short?'6–9':'9–15'} minutes including first instructions and practice. This is an estimate, not a deadline or measured duration. Each extra review and practice round may add 2–3 minutes.`:`${short?'体验版':'科研版'}：正式 ${config.totalItems} 题，每类 ${config.itemsPerCondition} 题；含首次说明及练习约 ${short?'6–9':'9–15'} 分钟。这是估时、非实测，不是时限。每轮重看说明与再练另估 2–3 分钟。`}</p>
    <p className="number-series-limit">{en?'Both versions use the same screen and rules; fewer repetitions do not establish equal validity. Proposed recruitment is ages 8–12 with the required addition and multiplication experience; age suitability, child difficulty and language comprehension remain unvalidated. These original items describe applying taught rules, not an equivalent Wechsler or Raven test.':'两版同界面、同单题规则，减少重复不代表效度等值。拟用于已学所需加法与乘法的 8–12 岁研究招募，年龄适用性、儿童难度及语言理解仍未验证。原创题目描述的是先教规则再应用，不是韦氏或瑞文等价测验。'}</p>
  </section>
}
