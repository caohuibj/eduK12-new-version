import {CognitiveTaskIntro} from '../shared/CognitiveTaskPresentation'
import {PRACTICE_PASS_CORRECT,PRACTICE_TRIAL_COUNT} from '../shared/practice'

export function GonogoInstructions({keyboardOnly,onStart}:{keyboardOnly:boolean;onStart:()=>void}){
  return <CognitiveTaskIntro title="Go/No-Go · 操作说明" onAction={onStart}
    description={<>
      <p>屏幕中央会依次出现圆形。请看清颜色，再决定是否反应。</p>
      <ol className="cognitive-gonogo-rules">
        <li><span className="cognitive-gonogo-example cognitive-gonogo-example--go" aria-hidden="true"/><div><strong>绿色圆形：立即反应</strong><p>{keyboardOnly?'尽快按一次空格键或 Enter 键。':'电脑按一次空格键或 Enter 键；触屏点击一次中央圆形。'}</p></div></li>
        <li><span className="cognitive-gonogo-example cognitive-gonogo-example--stop" aria-hidden="true"/><div><strong>红色圆形：不要反应</strong><p>不要按键或点击，等待圆形消失。</p></div></li>
        <li><span className="cognitive-gonogo-example cognitive-gonogo-example--wait" aria-hidden="true"/><div><strong>灰色圆形：等待</strong><p>等待下一次颜色出现，不提前按键，也不要长按。</p></div></li>
      </ol>
    </>}
    hint={<><p>先做 {PRACTICE_TRIAL_COUNT} 次练习，至少答对 {PRACTICE_PASS_CORRECT} 次后才能开始正式任务。练习不计入正式结果。</p><p>{keyboardOnly?'请把手指放在空格键附近，使用实体键盘作答。':'准备好使用键盘或中央圆形作答。'}看到绿色时又快又准地反应；看到红色时保持不动。</p></>}/>
}
