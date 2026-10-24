import { PAINTED_UI_ICONS, type UiIconName } from '@/use/paintedUiIcons'
import { prependBaseUrl } from '@/utils/function'

/**
 * Where a painted UI icon lives (tools/ui-icons/pack.mjs → public/images/ui-icons/).
 * `null` when the icon has no painting yet — the caller then shows the drawn SVG
 * (UiIcon.vue). One place builds these URLs, so the <img>, a CSS mask over the
 * icon (TreasureChest) and the splash preload always ask for the same file.
 */
export interface PaintedUiIconSrc {
  /** 128 px sprite (1×). */
  src: string
  /** 256 px sprite (2×). */
  src2x: string
  /** `srcset` for an <img>. */
  srcset: string
  /** Largest sprite (stat icons: 256 px `file4x`, else `src2x`) — canvas stamps. */
  srcMax: string
}

export const paintedUiIconSrc = (name: UiIconName): PaintedUiIconSrc | null => {
  const p = PAINTED_UI_ICONS[name]
  if (!p) return null
  const src = prependBaseUrl(`images/ui-icons/${p.file}?v=${p.v}`)
  const src2x = prependBaseUrl(`images/ui-icons/${p.file2x}?v=${p.v}`)
  const src4x = p.file4x ? prependBaseUrl(`images/ui-icons/${p.file4x}?v=${p.v}`) : null
  return { src, src2x, srcset: src4x ? `${src2x} 2x, ${src4x} 4x` : `${src2x} 2x`, srcMax: src4x ?? src2x }
}

/** The HUD core buttons' icons — always on screen in the menu, so the splash
 *  preloads their painted sprites (useAssets STATIC tier). */
export const HUD_UI_ICONS: readonly UiIconName[] = ['upgrade', 'leaderboard', 'daily', 'battlepass', 'chest', 'pvp', 'settings']

/**
 * Splash preload paths (base-relative, no leading slash) for the HUD icons'
 * painted sprites at the size this display actually fetches: the srcset picks
 * the 256 px file above 1× DPR. Icons with no painting are skipped (drawn SVG).
 */
export const hudUiIconPreloads = (dpr: number): string[] =>
  HUD_UI_ICONS.flatMap((name) => {
    const p = PAINTED_UI_ICONS[name]
    if (!p) return []
    return [`images/ui-icons/${dpr > 1 ? p.file2x : p.file}?v=${p.v}`]
  })
