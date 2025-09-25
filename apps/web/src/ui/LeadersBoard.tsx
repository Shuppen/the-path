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
        'w-full space-y-4 rounded-2xl border border-border-subtle bg-surface-raised/80 px-5 py-4 shadow-panel ring-1 ring-white/10 backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-cyan/80">Лидеры</p>
        <span className="text-[0.65rem] uppercase tracking-[0.25em] text-accent-magenta/70">Локально</span>
      </div>
      <dl className="space-y-3">
        {entries.map((entry) => (
          <Entry key={entry.key}>
            <div>
              <dt className="text-[0.65rem] uppercase tracking-[0.3em] text-accent-cyan/60">{entry.label}</dt>
              <dd className="font-mono text-2xl font-semibold text-slate-50 tabular-nums">{entry.value}</dd>
            </div>
            <p className="max-w-[180px] text-[0.7rem] text-slate-300">{entry.description}</p>
          </Entry>
        ))}
      </dl>
      <div className="rounded-xl border border-dashed border-accent-cyan/50 bg-accent-cyan/10 px-3 py-2 text-[0.7rem] text-accent-cyan">
        Синхронизация с сервером: скоро
      </div>
    </div>
  )
}
