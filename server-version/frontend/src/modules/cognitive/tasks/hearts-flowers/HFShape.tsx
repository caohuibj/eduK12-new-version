import React from 'react'
import type {Shape} from './generated/protocol'
/** Original paths and circle geometry frozen from the approved project preview; no external assets. */
export function HFShape({shape,size=78}:{shape:Shape;size?:number}){return <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">{shape==='heart'?<path d="M50 86 C40 76 12 58 12 34 C12 12 38 7 50 26 C62 7 88 12 88 34 C88 58 60 76 50 86Z" fill="#da5c71"/>:<><g fill="#7357aa"><circle cx="50" cy="23" r="20"/><circle cx="75" cy="42" r="20"/><circle cx="65" cy="72" r="20"/><circle cx="35" cy="72" r="20"/><circle cx="25" cy="42" r="20"/></g><circle cx="50" cy="49" r="13" fill="#fff"/></>}</svg>}
