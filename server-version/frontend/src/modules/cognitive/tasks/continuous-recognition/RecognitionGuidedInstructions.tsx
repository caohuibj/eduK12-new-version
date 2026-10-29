import React from 'react'
export function RecognitionGuidedInstructions({language='zh',profile}:{language?:'zh'|'en';profile:'research'|'experience'}){
  const en=language==='en',formal=profile==='research'?260:100
  return <section aria-label={en?'Instructions and examples':'操作说明与例子'}>
    <h1>{en?'Have you seen this picture in this round?':'这张图，在本轮见过吗？'}</h1>
    <p>{en?`You chose the ${profile==='research'?'research':'practical'} version: ${formal} formal presentations. Both versions use the same controls.`:`你选择的是${profile==='research'?'科研版':'实用版'}，正式呈现${formal}次；两版界面与操作相同。`}</p>
    <ol><li>{en?'Watch the picture in the centre. For its first appearance in this round, do nothing. There is no New button.':'看中央图片。本轮第一次看到它时，不操作；没有“没见过”按钮。'}</li>
      <li>{en?'For a picture already shown in this round, tap Seen once. Use the same button with a mouse, or press and release R. Extra taps and held-key repeats do not add answers.':'如果这张图片在本轮已经出现过，点一次“见过”。鼠标点同一按钮；键盘按一下R后松开。多点和长按不会增加答案。'}</li>
      <li>{en?'You may respond during the picture or its following +. That + still belongs to the previous picture; once the next picture appears, responses belong to the new picture.':'图片显示时和紧随其后的“+”期间，都可以回应上一张图片；下一张出现后，回应就归下一张。'}</li>
      <li>{en?'Keep watching after responding: a response does not end a picture early. Practice rounds and the formal stream each start a new memory list. Pictures from examples or an earlier practice round do not count.':'回应不会让图片提前结束，请继续看。每轮练习和正式阶段都重新开始记图，例子或上一轮见过的不算本轮重复。'}</li></ol>
    <h2>{en?'Examples':'举例'}</h2>
    <ul><li>{en?'Example 1: picture A appears for the first time → do nothing.':'例1：A图第一次出现 → 不操作。'}</li>
      <li>{en?'Example 2: A → B → A. On the second A, tap Seen once, even though B came between.':'例2：A → B → A，第二次看到A时点“见过”；中间换过B也算重复。'}</li>
      <li>{en?'Example 3: C → C. On the second C, tap Seen once; adjacent repetitions count too.':'例3：C → C，第二张C点“见过”；连续重复也算。'}</li>
      <li>{en?'Example 4: you recognise A just after it disappears. Tap during its following +; do not wait for the next picture.':'例4：A消失后才认出来，可在紧随其后的“+”时点；不要等下一张出现再点。'}</li></ul>
    <h2>{en?'Easier practice, then the formal stream':'先做较易练习，再正式作答'}</h2>
    <p>{en?'Each practice round has 8 presentations, including 2 repeats. At least 7 correct answers are needed. New pictures require no response; repeats require Seen. Practice pictures last 1.2 seconds, followed by + for 0.8 seconds, with short repetition gaps and feedback after every item.':'每轮练习8次呈现，其中2次重复；至少答对7次。新图不点、重复图点“见过”才算正确。练习图片显示1.2秒，再显示0.8秒“+”；重复间隔较短，每题后会暂停解释。'}</p>
    <p>{en?'If practice is not passed, read these instructions and examples again before retrying. Up to 3 rounds; you may stop. This checks understanding of the controls, not your memory ability.':'未通过时，重练前会重新呈现这份说明和例子。最多3轮，也可以结束；这是操作理解规则，不是记忆能力标准。'}</p>
    <p>{en?`Formal pictures last 0.75 seconds plus 0.8 seconds of +, without feedback or pauses between pictures. The stream takes about ${profile==='research'?'6 minutes 43 seconds':'2 minutes 35 seconds'}, plus instructions, practice and preparation. Practice is separate from formal results.`:`正式图片显示0.75秒加0.8秒“+”，连续呈现，没有逐题反馈；图片流约${profile==='research'?'6分43秒':'2分35秒'}，另加说明、练习及准备时间。练习不计入正式结果。`}</p>
    <p>{en?'Keep your device still and turn off notifications. If interrupted, the stream stops; saving retries retain existing records and do not show them again.':'请放稳设备、关闭通知。中断后停止呈现；保存重试会保留原记录，不重新展示图片。'}</p>
  <h2>{en?'When you are finished':'怎样算完成'}</h2><p>{en?`Finish all ${formal} formal pictures and wait for the saved-record confirmation. Practice is separate. If you end early, the unfinished part stays missing; if saving fails, keep this page open and retry the same record.`:`做完${formal}张图片正式任务后，等待记录保存成功的确认；练习另计。提前结束时，未完成部分保留缺失。保存失败请保留本页，只重试原记录。`}</p></section>
}
