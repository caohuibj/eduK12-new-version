import {z} from 'zod'

/** Immutable public artwork identity. The three path segments bind the image
 * manifest to the exact instrument, instrument version and administrator-
 * selected report version. It is display content, never a URL or asset grant. */
export const reportArtworkKeySchema=z.string().trim().max(180).regex(
 /^[a-z][a-z0-9_]*\/\d+\.\d+\.\d+\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
 '报告配图标识必须是 instrumentKey/instrumentVersion/reportVersion',
)

export const reportArtworkKeyFor=(instrumentKey:string,instrumentVersion:string,reportVersion:string)=>
 `${instrumentKey}/${instrumentVersion}/${reportVersion}`
