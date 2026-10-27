"""Run from repository root. Draw fixed original samples; no task, sequence or timing measurement."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import hashlib
import json
import os
import subprocess

D = Path('docs/cognitive-library/scenario-roadmap-20261027/domains/occupational/perceptual-confidence-implementation')
subprocess.run(['server-version/frontend/node_modules/esbuild/bin/esbuild', 'server-version/frontend/src/modules/cognitive/tasks/perceptual-confidence/generated/protocol.ts', '--bundle', '--format=iife', '--global-name=PcProtocol', '--platform=browser', '--outfile=/tmp/pc-protocol-preview.js'], check=True)
script = Path('/tmp/pc-protocol-preview.js').read_text()
css = Path('server-version/frontend/src/modules/cognitive/tasks/perceptual-confidence/pc.css').read_text()
body = '''<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#F8FAFC;color:#1F2937;font:16px/1.7 sans-serif}main{max-width:780px;margin:auto;padding:24px}h1{font-size:25px}section{margin:14px 0;background:white;padding:16px;border:1px solid #CBD5E1;border-radius:12px}p{margin:8px 0}.pc-scene{margin:auto;max-width:420px}small{font-size:13px;color:#4B5563}</style><style>''' + css + '''</style><main><h1>实际灰度图案生成 · 静态实现检视</h1><p>单个固定合成seed、目标在右。不是正式施测、计时录像或参与者数据。</p><div id="samples"></div><small>128×128 CSS像素／每图；24px间距。名义混合强度不是物理对比度或难度认证。中文、设备、难度和短版效度未验证。</small></main><script>''' + script + '''</script><script>
const cfg=PcProtocol.config('experience');
for(const strength of [4,10,20,45]){
 const p={index:0,phase:strength===45?'practice':'test',round:0,block:0,target:'right',strengthPercent:strength,conditionId:'right:'+strength,stimulusSeed:'pc-known-frame'};
 const frame=PcProtocol.stimulus(p,cfg),section=document.createElement('section');
 section.innerHTML='<b>'+(strength===45?'容易练习':'正式条件')+' · 名义混合权重 '+strength/100+'</b><div class="pc-scene"><span class="pc-cross">+</span><canvas class="pc-patch" width="128" height="128"></canvas><canvas class="pc-patch" width="128" height="128"></canvas></div>';
 document.querySelector('#samples').append(section);
 for(const [i,side] of ['left','right'].entries()){const canvas=section.querySelectorAll('canvas')[i],ctx=canvas.getContext('2d'),data=ctx.createImageData(128,128);data.data.set(frame[side].rgba);ctx.putImageData(data,0,0);canvas.dataset.strength=String(strength);canvas.dataset.side=side;}
}
</script>'''
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, chromium_sandbox=False, env={**os.environ, 'XDG_CONFIG_HOME': '/tmp/pc-pixel-preview-config', 'XDG_CACHE_HOME': '/tmp/pc-pixel-preview-cache'})
    page = browser.new_page(viewport={'width': 820, 'height': 1200}, device_scale_factor=1)
    page.route('**/*', lambda route: route.abort())
    page.set_content(body, wait_until='load')
    rows = page.evaluate("[...document.querySelectorAll('canvas')].map(c=>({strength:Number(c.dataset.strength),side:c.dataset.side,width:c.width,height:c.height,data:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)}))")
    for row in rows:
        row['sha256'] = hashlib.sha256(bytes(row.pop('data'))).hexdigest()
    gold = {'left': '9d5139ac496670643eae304e43cad47e3b00ba7cfff7daaf0b9bc97179202739', 'right': 'ec7a2d8a0c793f0fdf96209ffaae740639b547bdf5867d30456e079316d750e3'}
    assert all(r['sha256'] == gold[r['side']] for r in rows if r['strength'] == 10)
    page.screenshot(path=str(D / 'generated-stimulus-preview.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    layout = page.evaluate("({width:innerWidth,documentWidth:document.documentElement.scrollWidth,patches:[...document.querySelectorAll('canvas')].map(c=>({width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height}))})")
    assert layout['width'] == layout['documentWidth']
    browser.close()
obj = {'kind': 'ACTUAL_GENERATOR_CANVAS_PIXEL_READBACK_STATIC_ONLY', 'source': 'generated/protocol.ts bundled with installed esbuild; stimulus() only, no runner or sequence', 'browser': 'cloud Chromium; inner sandbox unavailable; managed execution container, all network aborted', 'goldenSource': 'independent Python integer/FNV/xorshift; 10% SHA256 matched native unit and browser getImageData', 'pixels': rows, 'phoneLayout': layout, 'timingMeasured': False, 'physicalContrastCalibrated': False, 'realDeviceAcceptance': False, 'imageSHA256': hashlib.sha256((D / 'generated-stimulus-preview.png').read_bytes()).hexdigest()}
(D / 'pixel-readback.json').write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'canvasCount': len(rows), 'goldenMatch': True, 'phoneNoHorizontalOverflow': True}))
