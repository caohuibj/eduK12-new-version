/** Original procedural line art, not GEFT/L-EFT test material. V1 is untouched. */
export const EMBEDDEDFIGURES_V2_STIMULUS = 'embeddedfigures-zh-v1.1.0'
export const EMBEDDEDFIGURES_V2_CHOICES = 7
export type Point = {x:number;y:number}
export type Segment = {a:Point;b:Point}
export type ContextFigure = {id:string;lines:Segment[]}
export type EmbeddedItemV2 = {target:Point[];field:ContextFigure[];targetId:string}
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x
const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y})
const EPS=1e-6
function randomFor(seed:string){
 let state=2166136261
 for(const char of seed)state=Math.imul(state^char.charCodeAt(0),16777619)
 return ()=>{state=(state+0x6d2b79f5)|0;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296}
}
function fullLine(a:Point,b:Point):Segment{
 const d=sub(b,a),points:Point[]=[]
 for(const x of [8,92])if(Math.abs(d.x)>EPS){const y=a.y+(x-a.x)*d.y/d.x;if(y>=8-EPS&&y<=92+EPS)points.push({x,y})}
 for(const y of [8,92])if(Math.abs(d.y)>EPS){const x=a.x+(y-a.y)*d.x/d.y;if(x>=8-EPS&&x<=92+EPS)points.push({x,y})}
 let best:Segment|undefined,length=0
 for(const p of points)for(const q of points){const l=(p.x-q.x)**2+(p.y-q.y)**2;if(l>length){length=l;best={a:p,b:q}}}
 if(!best)throw Error('Degenerate embedded figure line')
 return best
}
function onSegment(p:Point,s:Segment){
 return Math.abs(cross(sub(p,s.a),sub(s.b,s.a)))<EPS
  &&p.x>=Math.min(s.a.x,s.b.x)-EPS&&p.x<=Math.max(s.a.x,s.b.x)+EPS
  &&p.y>=Math.min(s.a.y,s.b.y)-EPS&&p.y<=Math.max(s.a.y,s.b.y)+EPS
}
/** Inspect rendered segments/intersections, not the generator's answer flag. */
export function embeddedTargetTranslations(figure:ContextFigure,target:Point[]):Point[]{
 const vertices=figure.lines.flatMap(s=>[s.a,s.b])
 for(let i=0;i<figure.lines.length;i++)for(let j=i+1;j<figure.lines.length;j++){
  const a=figure.lines[i],b=figure.lines[j],r=sub(a.b,a.a),s=sub(b.b,b.a),den=cross(r,s)
  if(Math.abs(den)<EPS)continue
  const t=cross(sub(b.a,a.a),s)/den,p={x:a.a.x+t*r.x,y:a.a.y+t*r.y}
  if(onSegment(p,a)&&onSegment(p,b))vertices.push(p)
 }
 const found:Point[]=[]
 for(const vertex of vertices){
  const shift=sub(vertex,target[0]),points=target.map(p=>({x:p.x+shift.x,y:p.y+shift.y}))
  if(points.every((p,i)=>figure.lines.some(s=>onSegment(p,s)&&onSegment(points[(i+1)%points.length],s)))
   &&!found.some(p=>Math.abs(p.x-shift.x)<EPS&&Math.abs(p.y-shift.y)<EPS))found.push(shift)
 }
 return found
}
export function embeddedfiguresItemV2(seed:string,index:number):EmbeddedItemV2{
 if(!Number.isInteger(index)||index<0)throw Error('Invalid embedded figure index')
 const random=randomFor(seed+':embeddedfigures:1.1.0:'+index),int=(n:number)=>Math.floor(random()*n)
 for(let attempt=0;attempt<64;attempt++){
  const raw=[{x:20+int(10),y:20+int(10)},{x:72+int(8),y:25+int(10)},{x:42+int(15),y:75+int(8)}]
  const center={x:(Math.min(...raw.map(p=>p.x))+Math.max(...raw.map(p=>p.x)))/2,y:(Math.min(...raw.map(p=>p.y))+Math.max(...raw.map(p=>p.y)))/2}
  // The target panel is centered independently of the answer location.
  const target=raw.map(p=>({x:p.x-center.x+50,y:p.y-center.y+50})),slot=int(EMBEDDEDFIGURES_V2_CHOICES)
  const field=Array.from({length:EMBEDDEDFIGURES_V2_CHOICES},(_,i)=>{
   const points=target.map(p=>({...p})),dx=int(7)-3,dy=int(7)-3
   if(i!==slot){const v=int(3);points[v].x+=i%2===0?9:-9;points[v].y+=i%2===0?-7:7}
   points.forEach(p=>{p.x+=dx;p.y+=dy})
   // Every candidate has the same count/style. Edges continue beyond corners
   // into context, so there is no isolated target outline or endpoint cue.
   const lines=points.map((p,j)=>fullLine(p,points[(j+1)%3]))
   lines.push(fullLine({x:8,y:16+int(65)},{x:92,y:16+int(65)}),
    fullLine({x:16+int(65),y:8},{x:16+int(65),y:92}),
    fullLine(points[0],{x:92,y:70+int(15)}),fullLine(points[2],{x:8,y:12+int(15)}))
   return {id:'s'+i,lines}
  })
  // Verify exactly one occurrence across all displayed geometry; clutter can
  // create intersections, so checking only polygon labels would be insufficient.
  if(field.every((f,i)=>embeddedTargetTranslations(f,target).length===(i===slot?1:0)))return {target,field,targetId:'s'+slot}
 }
 throw Error('Unable to construct a unique embedded figure')
}
