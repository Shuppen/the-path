import type { WorldState } from '../world'

const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t)

export class SceneRenderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(state: WorldState, alpha: number = 1): void {
    const { canvas } = this.ctx
    const width = canvas.width
    const height = canvas.height

    this.ctx.clearRect(0, 0, width, height)

    const supportsGradients =
      typeof this.ctx.createLinearGradient === 'function' &&
      typeof this.ctx.createRadialGradient === 'function'

    if (!supportsGradients) {
      this.ctx.fillStyle = '#020617'
      this.ctx.fillRect(0, 0, width, height)
      return
    }

    this.drawBackground(state, width, height)
    this.drawGround(state)
    this.drawObstacles(state)
    this.drawPlayer(state, alpha)
    this.drawFlashes(state)
    if (state.status === 'gameover') {
      this.drawGameOverOverlay(state)
    }
  }

  private drawBackground(state: WorldState, width: number, height: number): void {
    const pulse = Math.sin(state.time * 0.6) * 0.25 + 0.75
    const focus = state.pointer ?? {
      x: width * 0.5 + Math.sin(state.time * 0.8) * width * 0.12,
      y: height * 0.4 + Math.cos(state.time * 0.7) * height * 0.1,
    }

    const gradient = this.ctx.createRadialGradient(
      focus.x,
      focus.y,
      Math.min(width, height) * 0.1,
      focus.x,
      focus.y,
      Math.max(width, height) * 0.8 * pulse
    )

    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.18)')
    gradient.addColorStop(0.25, 'rgba(13, 148, 136, 0.12)')
    gradient.addColorStop(1, '#020617')

    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, width, height)
  }

  private drawGround(state: WorldState): void {
    const { stage } = state
    const gradient = this.ctx.createLinearGradient(0, stage.groundY, 0, stage.height)
    gradient.addColorStop(0, 'rgba(15, 118, 110, 0.85)')
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0.95)')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, stage.groundY, stage.width, stage.height - stage.groundY)

    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)'
    this.ctx.lineWidth = 2
    this.ctx.beginPath()
    this.ctx.moveTo(0, stage.groundY)
    this.ctx.lineTo(stage.width, stage.groundY)
    this.ctx.stroke()
  }

  private drawObstacles(state: WorldState): void {
    for (const obstacle of state.obstacles) {
      const x = obstacle.position.x
      const y = obstacle.position.y
      const w = obstacle.width
      const h = obstacle.height

      const gradient = this.ctx.createLinearGradient(x, y, x, y + h)
      if (obstacle.kind === 'spire') {
        gradient.addColorStop(0, 'rgba(244, 114, 182, 0.9)')
        gradient.addColorStop(1, 'rgba(244, 63, 94, 0.4)')
      } else if (obstacle.kind === 'pulse') {
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)')
        gradient.addColorStop(1, 'rgba(14, 116, 144, 0.4)')
      } else {
        gradient.addColorStop(0, 'rgba(147, 197, 253, 0.8)')
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.4)')
      }

      this.ctx.fillStyle = gradient
      this.ctx.beginPath()
      if (obstacle.kind === 'spire') {
        this.ctx.moveTo(x + w * 0.5, y)
        this.ctx.lineTo(x + w, y + h)
        this.ctx.lineTo(x, y + h)
        this.ctx.closePath()
      } else {
        this.drawRoundedRect(x, y, w, h, Math.min(10, w * 0.2))
      }
      this.ctx.fill()

      if (!obstacle.passed) {
        this.ctx.strokeStyle = 'rgba(244, 244, 255, 0.2)'
        this.ctx.lineWidth = 1
        this.ctx.stroke()
      }
    }
  }

  private drawPlayer(state: WorldState, alpha: number): void {
    const player = state.player
    const x = player.position.x
    const y = player.position.y
    const w = player.width
    const h = player.height

    const bob = Math.sin(state.time * 6) * (player.onGround ? 1.5 : 3)
    const bodyGradient = this.ctx.createLinearGradient(x, y, x, y + h)
    bodyGradient.addColorStop(0, 'rgba(16, 185, 129, 0.95)')
    bodyGradient.addColorStop(1, 'rgba(15, 118, 110, 0.9)')

    this.ctx.save()
    this.ctx.translate(0, -bob)
    this.ctx.fillStyle = bodyGradient
    this.drawRoundedRect(x, y, w, h, 12)
    this.ctx.fill()

    const visorGradient = this.ctx.createLinearGradient(x, y + h * 0.3, x, y + h * 0.55)
    visorGradient.addColorStop(0, 'rgba(226, 232, 240, 0.85)')
    visorGradient.addColorStop(1, 'rgba(148, 163, 184, 0.3)')
    this.ctx.fillStyle = visorGradient
    this.drawRoundedRect(x + w * 0.1, y + h * 0.3, w * 0.8, h * 0.25, 8)
    this.ctx.fill()

    this.ctx.globalAlpha = alpha * 0.45
    this.ctx.fillStyle = 'rgba(56, 189, 248, 0.45)'
    this.ctx.beginPath()
    if (typeof this.ctx.ellipse === 'function') {
      this.ctx.ellipse(x + w * 0.5, y + h * 0.95, w * 0.6, h * 0.2, 0, 0, Math.PI * 2)
    } else {
      this.ctx.arc(x + w * 0.5, y + h * 0.95, Math.max(w, h) * 0.15, 0, Math.PI * 2)
    }
    this.ctx.fill()
    this.ctx.restore()
  }

  private drawFlashes(state: WorldState): void {
    for (const flash of state.flashes) {
      const progress = easeOutQuad(Math.min(1, flash.age / flash.life))
      const radius = flash.radius * (1 + progress * 0.6)
      const alpha = (1 - progress) * flash.strength

      const gradient = this.ctx.createRadialGradient(
        flash.position.x,
        flash.position.y,
        radius * 0.2,
        flash.position.x,
        flash.position.y,
        radius
      )

      gradient.addColorStop(0, `rgba(59, 130, 246, ${alpha})`)
      gradient.addColorStop(0.6, `rgba(125, 211, 252, ${alpha * 0.45})`)
      gradient.addColorStop(1, 'rgba(15, 23, 42, 0)')

      this.ctx.fillStyle = gradient
      this.ctx.beginPath()
      this.ctx.arc(flash.position.x, flash.position.y, radius, 0, Math.PI * 2)
      this.ctx.fill()
    }
  }

  private drawGameOverOverlay(state: WorldState): void {
    const { width, height } = state.stage
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.35)'
    this.ctx.fillRect(0, 0, width, height)

    const message = 'Signal lost · Tap or press Space to restart'
    this.ctx.font = `${Math.max(24, width * 0.035)}px "Inter", sans-serif`
    this.ctx.fillStyle = 'rgba(226, 232, 240, 0.9)'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(message, width * 0.5, height * 0.35)
  }

  private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    if (typeof this.ctx.roundRect === 'function') {
      this.ctx.roundRect(x, y, width, height, radius)
    } else {
      this.ctx.rect(x, y, width, height)
    }
  }
}
