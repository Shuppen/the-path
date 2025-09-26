import type { ChallengeState } from '../liveops/challenges'

interface EventsScreenProps {
  daily: ChallengeState
  weekly: ChallengeState
  onBack: () => void
  onClaimDaily: () => void
  onClaimWeekly: () => void
  statusMessage?: string | null
}

const composeClassName = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ')

const formatProgress = (value: number, goal: number): string => `${value}/${goal}`

const ChallengeCard = ({
  state,
  onClaim,
}: {
  state: ChallengeState
  onClaim: () => void
}) => {
  const canClaim = state.progress >= state.goal && !state.claimed
  const progress = Math.min(1, state.progress / Math.max(1, state.goal))
  return (
    <div className="rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6 text-sm text-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">
            {state.kind === 'daily' ? 'DAILY' : 'WEEKLY'}
          </p>
          <h2 className="text-lg font-semibold text-white">{state.title}</h2>
          <p className="text-xs text-slate-400">{state.description}</p>
          <p className="mt-2 text-xs text-slate-500">Награда: {state.rewardCoins} ◈</p>
        </div>
        <button
          type="button"
          onClick={onClaim}
          disabled={!canClaim}
          className={composeClassName(
            'rounded-full px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
            canClaim
              ? 'border border-cyan-400/60 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30'
              : state.claimed
                ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                : 'cursor-not-allowed border border-slate-700/60 bg-slate-900/60 text-slate-500',
          )}
        >
          {state.claimed ? 'Получено' : canClaim ? 'Забрать' : 'Недоступно'}
        </button>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Прогресс</span>
          <span>{formatProgress(state.progress, state.goal)}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
      <div className="mt-6 space-y-2 text-[0.7rem] text-slate-400">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Лидерборд (локальная заглушка)</p>
        <ul className="space-y-1">
          {state.leaderboard.map((entry, index) => (
            <li key={entry.name} className="flex items-center justify-between">
              <span className="font-medium text-slate-200">
                {index + 1}. {entry.name}
              </span>
              <span className="font-mono text-slate-300">{entry.score.toLocaleString('ru-RU')}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function EventsScreen({ daily, weekly, onBack, onClaimDaily, onClaimWeekly, statusMessage }: EventsScreenProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0B0F14] text-slate-100">
      <header className="flex items-center justify-between px-6 pb-6 pt-10">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-slate-700/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Назад
        </button>
        <span className="text-xs text-slate-400">Ежедневные и еженедельные миссии</span>
      </header>

      <main className="flex-1 space-y-6 px-6 pb-16">
        {statusMessage ? (
          <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
            {statusMessage}
          </div>
        ) : null}
        <ChallengeCard state={daily} onClaim={onClaimDaily} />
        <ChallengeCard state={weekly} onClaim={onClaimWeekly} />
      </main>
    </div>
  )
}

export default EventsScreen
