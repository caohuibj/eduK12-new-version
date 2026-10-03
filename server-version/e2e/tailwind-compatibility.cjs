// Computed styles from the production stylesheet, not class-name assertions.
const assert = require('node:assert/strict')
const fixture = `<section id="tailwind-compatibility" aria-label="样式兼容验收">
  <div data-probe="go" class="bg-green-500 ring ring-green-200 p-4 rounded shadow-sm">合成绿色刺激</div>
  <div data-probe="stop" class="bg-red-500">合成红色刺激</div>
  <div data-probe="waiting" class="bg-gray-300">等待</div>
  <div data-probe="neutral" class="bg-gray-200">中性</div>
  <div data-probe="border" class="border">边框</div>
  <div data-probe="overlay" class="bg-black/90">遮罩</div>
  <div data-probe="space" class="space-y-4"><span class="mb-4">第一项</span><span hidden>隐藏</span><span>第二项</span></div>
  <div data-probe="divide" class="divide-y"><div>第一行</div><div>第二行</div></div>
  <button data-probe="button" class="btn-primary">操作</button>
  <input data-probe="input" class="input" placeholder="提示">
  <button data-probe="outline" class="outline-hidden">焦点</button>
</section>`
async function verifyTailwindCompatibility(page) {
  const values = await page.evaluate((html) => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = html
    document.body.append(wrapper)
    try {
      const style = name => getComputedStyle(wrapper.querySelector(`[data-probe="${name}"]`))
      const second = name => getComputedStyle(wrapper.querySelector(`[data-probe="${name}"]`).lastElementChild)
      return {
        go: style('go').backgroundColor, stop: style('stop').backgroundColor,
        waiting: style('waiting').backgroundColor, neutral: style('neutral').backgroundColor,
        radius: style('go').borderRadius, padding: style('go').padding,
        shadow: style('go').boxShadow, border: style('border').borderTopColor,
        borderWidth: style('border').borderTopWidth, overlay: (() => { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); ctx.fillStyle = style('overlay').backgroundColor; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data) })(),
        firstBottom: getComputedStyle(wrapper.querySelector('[data-probe="space"]').firstElementChild).marginBottom, spaceTop: second('space').marginTop, spaceBottom: second('space').marginBottom,
        divideTop: second('divide').borderTopWidth, divideColor: second('divide').borderTopColor,
        buttonHeight: style('button').minHeight, buttonColor: style('button').backgroundColor,
        inputHeight: style('input').minHeight,
        placeholder: getComputedStyle(wrapper.querySelector('[data-probe="input"]'), '::placeholder').color,
        outline: style('outline').outlineStyle, outlineWidth: style('outline').outlineWidth,
      }
    } finally { wrapper.remove() }
  }, fixture)
  assert.equal(values.go, 'rgb(34, 197, 94)', 'protected GO stimulus color changed')
  assert.equal(values.stop, 'rgb(239, 68, 68)', 'protected STOP stimulus color changed')
  assert.equal(values.waiting, 'rgb(209, 213, 219)')
  assert.equal(values.neutral, 'rgb(229, 231, 235)')
  assert.equal(values.radius, '4px')
  assert.equal(values.padding, '16px')
  assert.match(values.shadow, /rgba\(0, 0, 0, 0\.05\) 0px 1px 2px/)
  assert.match(values.shadow, /rgb\(187, 247, 208\) 0px 0px 0px 3px/)
  assert.equal(values.border, 'rgb(229, 231, 235)')
  assert.equal(values.borderWidth, '1px')
  assert.deepEqual(values.overlay.slice(0, 3), [0, 0, 0]); assert.ok(Math.abs(values.overlay[3] - 230) <= 1)
  assert.equal(values.firstBottom, '16px')
  assert.equal(values.spaceTop, '16px')
  assert.equal(values.spaceBottom, '0px')
  assert.equal(values.divideTop, '1px')
  assert.equal(values.divideColor, 'rgb(229, 231, 235)')
  assert.equal(values.buttonHeight, '44px')
  assert.equal(values.buttonColor, 'rgb(47, 111, 237)')
  assert.equal(values.inputHeight, '44px')
  assert.equal(values.placeholder, 'rgb(156, 163, 175)')
  assert.equal(values.outline, 'solid')
  assert.equal(values.outlineWidth, '2px')
  return values
}
module.exports = { fixture, verifyTailwindCompatibility }
