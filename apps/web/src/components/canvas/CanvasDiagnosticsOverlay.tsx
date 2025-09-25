import type { DevicePerformanceProfile, ViewportMetrics } from '@the-path/types'

interface CanvasDiagnosticsOverlayProps {
  metrics: ViewportMetrics | null
  profile: DevicePerformanceProfile | null
  fps: number
  frameTime: number
  className?: string
  hidden?: boolean
}

const joinClassNames = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ')

const formatNumber = (value: number, fractionDigits = 1): string => {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(fractionDigits)
}

const formatFps = (fps: number): string => {
  if (!Number.isFinite(fps) || fps <= 0) {
    return '—'
  }
  if (fps >= 100) {
    return Math.round(fps).toString()
  }
  return fps.toFixed(1)
}

export const CanvasDiagnosticsOverlay = ({
  metrics,
  profile,
  fps,
  frameTime,
  className,
  hidden,
}: CanvasDiagnosticsOverlayProps) => {
  if (hidden) return null

  const appliedDpr = metrics?.devicePixelRatio ?? profile?.recommendedDevicePixelRatio
  const recommendedDpr = profile?.recommendedDevicePixelRatio ?? appliedDpr
  const pixelBudget = profile?.pixelBudget ?? metrics?.pixelBudget
  const tierLabel = profile?.tier ? profile.tier.toUpperCase() : '—'
  const reasons = profile?.reasons ?? []

  if (!metrics && !profile) {
    return null
  }

  return (
    <div
      className={joinClassNames(
        'pointer-events-none flex max-w-[18rem] flex-col gap-2 rounded-xl bg-slate-950/75 px-3 py-2 text-[11px] text-slate-200 shadow-lg shadow-slate-950/60 ring-1 ring-white/10 backdrop-blur-sm',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
        <dt className="text-slate-400">Tier</dt>
        <dd className="font-semibold text-slate-100">{tierLabel}</dd>
        <dt className="text-slate-400">FPS</dt>
        <dd className="font-semibold text-slate-100">{formatFps(fps)}</dd>
        <dt className="text-slate-400">Frame</dt>
        <dd className="text-slate-200">{formatNumber(frameTime, 2)} ms</dd>
        <dt className="text-slate-400">DPR</dt>
        <dd className="text-slate-200">{formatNumber(appliedDpr ?? 0, 2)}</dd>
        <dt className="text-slate-400">Rec. DPR</dt>
        <dd className="text-slate-200">{formatNumber(recommendedDpr ?? 0, 2)}</dd>
        {pixelBudget ? (
          <>
            <dt className="text-slate-400">Budget</dt>
            <dd className="text-slate-200">{Math.round(pixelBudget / 1_000_000 * 10) / 10} MPx</dd>
          </>
        ) : null}
        {metrics ? (
          <>
            <dt className="text-slate-400">Viewport</dt>
            <dd className="text-slate-200">{metrics.width} × {metrics.height}</dd>
          </>
        ) : null}
      </dl>
      {reasons.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4 text-[10px] text-slate-400">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default CanvasDiagnosticsOverlay
