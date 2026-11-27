import { z } from 'zod'

/** A versioned public illustration key, never a URL or an asset grant. */
export const reportArtworkKeySchema = z.string().trim().max(180).regex(
  /^[a-z][a-z0-9_]*\/\d+\.\d+\.\d+\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
  '报告配图标识必须是 instrumentKey/instrumentVersion/reportVersion',
)

export const reportArtworkKeyFor = (instrumentKey: string, instrumentVersion: string, reportVersion: string) =>
  `${instrumentKey}/${instrumentVersion}/${reportVersion}`

/** Decoder for previously authored fixed illustration names. */
export const reportIllustrationKeySchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)
