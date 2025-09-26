import CanvasRecorder, { type RecorderBufferState, type RecorderState } from './CanvasRecorder'
import type { WebAudioAnalysis } from '../audio/WebAudioAnalysis'

export interface ClipPreset {
  id: string
  label: string
  description: string
  duration: number
  sfxOnly: boolean
  sticker?: string
  titleOverlay?: string
}

export interface ExportResult {
  blob: Blob
  preset: ClipPreset
  url?: string
}

const DEFAULT_DURATION = 15

export class ReplayClipExporter {
  private readonly recorder: CanvasRecorder | null
  private readonly presets: ClipPreset[]
  private readonly canvas: HTMLCanvasElement | null
  private state: RecorderState = 'idle'
  private bufferState: RecorderBufferState = { duration: 0, limit: DEFAULT_DURATION }

  constructor(canvas: HTMLCanvasElement | null, private readonly audio: WebAudioAnalysis | null) {
    this.canvas = canvas
    if (!canvas) {
      this.recorder = null
      this.presets = []
      return
    }

    this.presets = [
      {
        id: 'highlight',
        label: 'Хайлайт 15 сек',
        description: 'Авто-SFX микс без музыки, подходит для соцсетей.',
        duration: 15,
        sfxOnly: true,
        sticker: '🔥',
        titleOverlay: 'The Path — Highlight',
      },
      {
        id: 'longform',
        label: 'Полный клип 20 сек',
        description: 'Сохранить последние двадцать секунд геймплея.',
        duration: 20,
        sfxOnly: false,
        sticker: '🎵',
        titleOverlay: 'The Path — Replay',
      },
      {
        id: 'reaction',
        label: 'Реакция 10 сек',
        description: 'Короткий клип с эмодзи для сторис.',
        duration: 10,
        sfxOnly: true,
        sticker: '⚡️',
        titleOverlay: 'Следуй ритму',
      },
    ]

    const audioStreamFactory = () => {
      if (!this.audio) return null
      const handle = this.audio.createRecordingStream()
      if (!handle) return null
      return { stream: handle.stream, cleanup: handle.disconnect }
    }

    this.recorder = new CanvasRecorder(canvas, {
      bufferDuration: Math.max(...this.presets.map((preset) => preset.duration), DEFAULT_DURATION),
      chunkInterval: 750,
      audioStreamFactory,
    })

    this.recorder.onStateChange((next) => {
      this.state = next
    })

    this.recorder.onBufferUpdate((next) => {
      this.bufferState = next
    })
  }

  getPresets(): ClipPreset[] {
    return [...this.presets]
  }

  getState(): RecorderState {
    return this.state
  }

  getBufferState(): RecorderBufferState {
    return this.bufferState
  }

  isSupported(): boolean {
    return Boolean(this.recorder && this.recorder.isSupported())
  }

  start(): boolean {
    if (!this.recorder) return false
    return this.recorder.start()
  }

  stop(): void {
    if (!this.recorder) return
    this.recorder.stop()
  }

  destroy(): void {
    this.recorder?.destroy()
  }

  async exportClip(presetId: string): Promise<ExportResult | null> {
    if (!this.recorder) {
      return null
    }
    const preset = this.presets.find((entry) => entry.id === presetId)
    if (!preset) {
      throw new Error(`Unknown preset: ${presetId}`)
    }

    const blob = this.recorder.exportClip()
    const url = typeof URL !== 'undefined' ? URL.createObjectURL(blob) : undefined
    return {
      blob,
      preset,
      url,
    }
  }
}

export default ReplayClipExporter
