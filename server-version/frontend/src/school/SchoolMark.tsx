import a1OriginalArtwork from './huischool-a1-source.png'

/**
 * SOURCE-LOCKED A1, not a newly drawn interpretation:
 *
 * Notion: https://app.notion.com/p/3f4d27635a38813a89a0e9740467da1d
 * Original approved triptych:
 * https://drive.google.com/file/d/11EgH4bYHlooDgx_hlqBxXEomIpzc-6uD/view
 * PNG asset is 1180 x 470, preserved verbatim from the backed-up original.
 *
 * ViewBox clips ONLY the left A1 forest/sun/sapling emblem, excluding its
 * comparison-board heading and the unrelated B3/W2 logos. No trees/branches
 * are redrawn or generated. The complete editable path-based SVG master is
 * separate future brand-asset work; this is a faithful raster-source crop.
 *
 * Keep the app's accessible wordmark as text for narrow/mobile headers.
 */
const ORIGINAL_WIDTH = 1180
const ORIGINAL_HEIGHT = 470
const A1_EMBLEM_VIEWBOX = '51 70 273 197'

export function HuischoolA1Emblem({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox={A1_EMBLEM_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <image
        href={a1OriginalArtwork}
        x="0"
        y="0"
        width={ORIGINAL_WIDTH}
        height={ORIGINAL_HEIGHT}
        preserveAspectRatio="xMinYMin meet"
      />
    </svg>
  )
}

export function SchoolMark() {
  return (
    <div className="hs-brand" aria-label="Huischool · 林间见心">
      <HuischoolA1Emblem className="hs-brand-icon" />
      <div className="hs-brand-copy">
        <strong>Huischool</strong>
        <small>林间见心 · 校园心理健康</small>
      </div>
    </div>
  )
}

/** Original A1 emblem as hero artwork; no new forestry illustration. */
export function SchoolHeroMark() {
  return (
    <div className="hs-hero-brand-art" aria-hidden="true">
      <HuischoolA1Emblem className="hs-hero-brand-icon" />
    </div>
  )
}
