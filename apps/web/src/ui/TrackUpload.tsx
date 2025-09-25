import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  describeAcceptedFormats,
  formatValidationErrorMessage,
  validateAudioFileType,
} from '../audio/uploadValidation'

export interface TrackUploadProps {
  onFileAccepted: (file: File) => void
  disabled?: boolean
  processing?: boolean
  error?: string | null
  onClearError?: () => void
}

const hasFiles = (event: DragEvent): boolean => {
  const types = Array.from(event.dataTransfer?.types ?? [])
  return types.includes('Files')
}

export function TrackUpload({
  onFileAccepted,
  disabled = false,
  processing = false,
  error,
  onClearError,
}: TrackUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragDepth = useRef(0)
  const [dragActive, setDragActive] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const combinedError = useMemo(() => error ?? localError, [error, localError])

  const resetErrors = useCallback(() => {
    setLocalError(null)
    onClearError?.()
  }, [onClearError])

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return
      const file = files[0]
      const validationError = validateAudioFileType(file)
      if (validationError) {
        setLocalError(formatValidationErrorMessage(validationError, file.name))
        return
      }
      resetErrors()
      onFileAccepted(file)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    },
    [onFileAccepted, resetErrors],
  )

  const handleButtonClick = useCallback(() => {
    if (disabled) return
    resetErrors()
    inputRef.current?.click()
  }, [disabled, resetErrors])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleDragEnter = (event: DragEvent) => {
      if (disabled || !hasFiles(event)) return
      dragDepth.current += 1
      setDragActive(true)
    }

    const handleDragLeave = (event: DragEvent) => {
      if (disabled || !hasFiles(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) {
        setDragActive(false)
      }
    }

    const handleDragOver = (event: DragEvent) => {
      if (disabled || !hasFiles(event)) return
      event.preventDefault()
    }

    const handleDrop = (event: DragEvent) => {
      if (disabled || !hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setDragActive(false)
      handleFiles(event.dataTransfer?.files ?? null)
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [disabled, handleFiles])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".ogg,.mp3,.wav"
        tabIndex={-1}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />

      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled || processing}
        className="inline-flex w-full items-center justify-center rounded-2xl border border-cyan-400/50 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-cyan-100 shadow-inner shadow-cyan-500/20 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {processing ? 'Анализируем…' : 'Загрузить трек'}
      </button>

      <p className="mt-2 text-xs text-slate-400">
        Поддерживаются форматы {describeAcceptedFormats()} · перетащите файл на экран или выберите вручную.
      </p>
      {combinedError ? (
        <p className="mt-1 text-xs text-rose-300" title={combinedError}>
          {combinedError}
        </p>
      ) : null}

      {dragActive ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="rounded-3xl border border-dashed border-cyan-400/60 bg-cyan-400/10 px-6 py-5 text-center text-sm font-medium text-cyan-100 shadow-2xl shadow-cyan-500/30">
            Отпустите, чтобы загрузить трек
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default TrackUpload
