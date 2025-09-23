import type { PropsWithChildren } from 'react'

import { padScore } from './scoreFormatting'

const composeClassName = (
  ...classes: Array<string | false | null | undefined>
): string => classes.filter(Boolean).join(' ')

export interface LeadersBoardProps {
  sessionBest: number
  personalBest: number
  className?: string
}

const Entry = ({ children, className }: PropsWithChildren<{ className?: string }>) => (
  <div className={composeClassName('flex items-start justify-between gap-4', className)}>{children}</div>
)

export const LeadersBoard = ({ sessionBest, personalBest, className }: LeadersBoardProps) => {
  const entries = [
    {
      key: 'session',
      label: 'Сессия',
      value: padScore(sessionBest),
      description: 'Лучший результат за текущий запуск',
    },
    {
      key: 'personal',
      label: 'Личный рекорд',
      value: padScore(personalBest),
      description: 'Сохранён локально на этом устройстве',
    },
  ] as const

  return (
    <div
      className={composeClassName(
        'w-full space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 shadow-lg ring-1 ring-white/10',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Лидеры</p>
        <span className="text-[0.65rem] uppercase tracking-[0.25em] text-cyan-200/70">Локально</span>
      </div>
      <dl className="space-y-3">
        {entries.map((entry) => (
          <Entry key={entry.key}>
            <div>
              <dt className="text-[0.65rem] uppercase tracking-[0.3em] text-cyan-300/60">{entry.label}</dt>
              <dd className="font-mono text-2xl font-semibold text-slate-50 tabular-nums">{entry.value}</dd>
            </div>
            <p className="max-w-[160px] text-[0.7rem] text-slate-400">{entry.description}</p>
          </Entry>
        ))}
      </dl>
      <div className="rounded-xl border border-dashed border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-[0.7rem] text-cyan-100">
        Синхронизация с сервером: скоро
      </div>
    </div>
  )
}
