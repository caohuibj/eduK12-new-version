import type { AntCapture,AntStage } from './capture'
import type { AntFrozenDisplay } from './display'
const ns='http://www.w3.org/2000/svg'
const shape=(name:string,attrs:Record<string,string|number>)=>{
  const e=document.createElementNS(ns,name)
  for(const [key,value] of Object.entries(attrs))e.setAttribute(key,String(value))
  return e
}
/** Synchronous SVG mutation in the same rAF callback whose clock Capture records. */
export function paintAnt(svg:SVGSVGElement,capture:AntCapture|null,display:AntFrozenDisplay,stage:AntStage='fixation'){
  const g=display.geometry,cx=g.fieldWidthCssPx/2,cy=g.fieldHeightCssPx/2
  svg.replaceChildren()
  svg.setAttribute('viewBox',`0 0 ${g.fieldWidthCssPx} ${g.fieldHeightCssPx}`)
  svg.setAttribute('data-ant-paint',stage)
  const stroke='#000000'
  const cross=g.cueDiameterCssPx/2*(8/9)
  const central=stage==='cue'&&capture?.plan.cue==='central'
  if(!central)svg.append(shape('path',{d:`M ${cx-cross} ${cy} H ${cx+cross} M ${cx} ${cy-cross} V ${cy+cross}`,stroke,'stroke-width':g.strokeCssPx,fill:'none'}))
  if(!capture)return
  const p=capture.plan
  if(stage==='cue'&&p.cue!=='none'){
    const ys=p.cue==='central'?[cy]:p.cue==='double'?[cy-g.eccentricityCssPx,cy+g.eccentricityCssPx]
      :[cy+(p.location==='top'?-1:1)*g.eccentricityCssPx]
    for(const y of ys){
      const r=g.cueDiameterCssPx/2,diag=r*(6.4/9)
      for(const [dx,dy] of [[r,0],[0,r],[diag,diag],[diag,-diag]])
        svg.append(shape('line',{x1:cx-dx,y1:y-dy,x2:cx+dx,y2:y+dy,stroke,'stroke-width':g.strokeCssPx}))
    }
  }
  if(stage==='target'){
    const y=cy+(p.location==='top'?-1:1)*g.eccentricityCssPx
    for(let slot=-2;slot<=2;slot++){
      const x=cx+slot*g.arrowSpacingCssPx
      if(slot!==0&&p.flanker==='neutral'){
        if(p.neutralVariant==='dashes')svg.append(shape('line',{x1:x-g.arrowWidthCssPx*(15/40),y1:y,x2:x+g.arrowWidthCssPx*(15/40),y2:y,stroke,'stroke-width':g.strokeCssPx}))
        continue
      }
      const direction=slot===0||p.flanker==='congruent'?p.direction:p.direction==='left'?'right':'left'
      const w=g.arrowWidthCssPx,h=g.arrowHeightCssPx,sign=direction==='right'?1:-1
      // Approved preview primitive: shaft (5,10)-(35,10), tip (40,10)/(30,5)/(30,15) in 40x20 units.
      svg.append(shape('line',{x1:x-w*(15/40),y1:y,x2:x+w*(15/40),y2:y,stroke,'stroke-width':g.strokeCssPx}))
      const points=[[w/2,0],[w/4,-h/4],[w/4,h/4]].map(([px,py])=>`${x+px*sign},${y+py}`).join(' ')
      svg.append(shape('polygon',{points,fill:stroke}))
    }
  }
}
