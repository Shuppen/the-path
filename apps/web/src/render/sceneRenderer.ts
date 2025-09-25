import { subscribeToReducedMotion } from '../environment/reducedMotion'
import type { LaneNote, WorldState } from '../world'
import { HITBAR_HEIGHT_RATIO } from '../world/constants'

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

const clamp01 = (value: number): number => {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

const NOTE_BASE_COLOR = '#38bdf8'
const PERFECT_COLOR = '#34d399'
const GOOD_COLOR = '#38bdf8'
const MISS_COLOR = '#f87171'
const BACKGROUND_COLOR = '#0B0F14'

const drawCapsule = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

const getFeedbackColor = (judgement: LaneNote['judgement']): string => {
  switch (judgement) {
    case 'perfect':
      return PERFECT_COLOR
    case 'good':
      return GOOD_COLOR
    case 'miss':
      return MISS_COLOR
    default:
      return NOTE_BASE_COLOR
  }
}

export class SceneRenderer {
  private prefersReducedMotion = false
  private unsubscribeReducedMotion?: () => void

  constructor(private readonly ctx: CanvasRenderingContext2D) {
    this.unsubscribeReducedMotion = subscribeToReducedMotion((value) => {
      this.prefersReducedMotion = value
    })
  }

  dispose(): void {
    this.unsubscribeReducedMotion?.()
    this.unsubscribeReducedMotion = undefined
  }

  render(state: WorldState): void {
    const { canvas } = this.ctx
    const width = canvas.width
    const height = canvas.height

    this.ctx.clearRect(0, 0, width, height)
    this.drawBackground(width, height)

    this.drawLanes(state)
    this.drawNotes(state)
    this.drawHitbar(state)
    this.drawRunner(state)
    this.drawFeedback(state)
  }

  private drawBackground(width: number, height: number): void {
    this.ctx.fillStyle = BACKGROUND_COLOR
    this.ctx.fillRect(0, 0, width, height)

    const gradient = this.ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.18)')
    gradient.addColorStop(0.5, 'rgba(192, 132, 252, 0.14)')
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0.3)')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, width, height)
  }

  private drawLanes(state: WorldState): void {
    const { stage } = state
    for (let lane = 0; lane < stage.laneCount; lane += 1) {
      const x = stage.lanePadding + stage.laneWidth * lane
      const laneGradient = this.ctx.createLinearGradient(0, 0, 0, stage.height)
      laneGradient.addColorStop(0, 'rgba(15, 23, 42, 0.45)')
      laneGradient.addColorStop(0.6, 'rgba(8, 47, 73, 0.35)')
      laneGradient.addColorStop(1, 'rgba(12, 38, 63, 0.55)')
      this.ctx.fillStyle = laneGradient
      this.ctx.fillRect(x, 0, stage.laneWidth, stage.height)

      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.08)'
      this.ctx.fillRect(x, 0, 1.5, stage.height)
    }
  }

  private drawNotes(state: WorldState): void {
    const { stage, time } = state
    const noteWidth = stage.laneWidth * 0.64
    const noteHeight = Math.max(stage.laneWidth * 0.72, stage.laneWidth * 0.55)
    const radius = noteWidth * 0.5

    for (const note of state.notes) {
      const delta = note.time - time
      const y = stage.hitLineY - delta * stage.scrollSpeed
      if (y > stage.height + noteHeight || y < -noteHeight * 2) continue

      const laneX = stage.lanePadding + stage.laneWidth * note.lane + (stage.laneWidth - noteWidth) * 0.5
      const opacity = clamp01(1 - Math.max(0, delta) / 3)

      this.ctx.save()
      const gradient = this.ctx.createLinearGradient(laneX, y, laneX, y + noteHeight)
      gradient.addColorStop(0, `rgba(56, 189, 248, ${0.75 * opacity})`)
      gradient.addColorStop(1, `rgba(34, 211, 238, ${0.55 * opacity})`)
      this.ctx.fillStyle = gradient
      drawCapsule(this.ctx, laneX, y - noteHeight / 2, noteWidth, noteHeight, radius)
      this.ctx.restore()
    }
  }

  private drawHitbar(state: WorldState): void {
    const { stage } = state
    const hitbarHeight = stage.height * HITBAR_HEIGHT_RATIO
    const y = stage.height - hitbarHeight
    const gradient = this.ctx.createLinearGradient(0, y, 0, stage.height)
    gradient.addColorStop(0, 'rgba(12, 74, 110, 0.45)')
    gradient.addColorStop(1, 'rgba(8, 47, 73, 0.75)')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(stage.lanePadding, y, stage.laneWidth * stage.laneCount, hitbarHeight)

    this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
    this.ctx.lineWidth = 2
    this.ctx.beginPath()
    this.ctx.moveTo(stage.lanePadding, stage.hitLineY)
    this.ctx.lineTo(stage.lanePadding + stage.laneWidth * stage.laneCount, stage.hitLineY)
    this.ctx.stroke()
  }

  private drawRunner(state: WorldState): void {
    const { stage, runner } = state

    const elapsed = Math.max(0, state.time - runner.transitionStart)
    const hasTransition = runner.transitionDuration > 0
    const linearProgress = hasTransition ? clamp01(elapsed / Math.max(0.0001, runner.transitionDuration)) : 1
    const easedProgress = !this.prefersReducedMotion && hasTransition ? easeInOutCubic(linearProgress) : linearProgress

    const fromLane = hasTransition ? runner.transitionFrom : runner.targetLane
    const toLane = runner.targetLane
    const lanePosition = hasTransition
      ? fromLane + (toLane - fromLane) * easedProgress
      : runner.position ?? toLane

    const x = stage.lanePadding + stage.laneWidth * lanePosition + stage.laneWidth * 0.5
    const y = stage.hitLineY - stage.laneWidth * 0.25

    const radius = stage.laneWidth * 0.4

    const glowGradient = this.ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * 1.2)
    glowGradient.addColorStop(0, 'rgba(34, 211, 238, 0.55)')
    glowGradient.addColorStop(1, 'rgba(34, 211, 238, 0)')
    this.ctx.fillStyle = glowGradient
    this.ctx.fillRect(x - radius * 1.2, y - radius * 1.2, radius * 2.4, radius * 2.4)

    this.ctx.fillStyle = 'rgba(56, 189, 248, 0.95)'
    this.ctx.beginPath()
    this.ctx.ellipse(x, y, radius * 0.85, radius * 0.55, 0, 0, Math.PI * 2)
    this.ctx.fill()
  }

  private drawFeedback(state: WorldState): void {
    const now = state.time
    for (const feedback of state.feedback) {
      const life = now - feedback.createdAt
      const t = clamp01(life / 0.45)
      const opacity = 1 - t
      const radius = 28 + t * 64
      const color = getFeedbackColor(feedback.judgement)
      const gradient = this.ctx.createRadialGradient(
        feedback.x,
        feedback.y,
        radius * 0.25,
        feedback.x,
        feedback.y,
        radius,
      )
      gradient.addColorStop(0, `${color}cc`)
      gradient.addColorStop(1, `${color}00`)
      this.ctx.fillStyle = gradient
      this.ctx.globalAlpha = opacity
      this.ctx.beginPath()
      this.ctx.arc(feedback.x, feedback.y, radius, 0, Math.PI * 2)
      this.ctx.fill()
      this.ctx.globalAlpha = 1
    }
  }
}
