import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  describeAcceptedFormats,
  FILE_INPUT_ACCEPT,
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
        accept={FILE_INPUT_ACCEPT}
        tabIndex={-1}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />

      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled || processing}
        className="inline-flex w-full items-center justify-center rounded-2xl border border-border-strong bg-surface-overlay/80 px-4 py-3 text-sm font-semibold text-slate-50 shadow-panel transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-60"
      >
        {processing ? 'Анализируем…' : 'Загрузить трек'}
      </button>

      <p className="mt-2 text-xs text-slate-300">
        Поддерживаются форматы {describeAcceptedFormats()} · перетащите файл на экран или выберите вручную.
      </p>
      {combinedError ? (
        <p className="mt-1 text-xs text-rose-300" title={combinedError} role="alert" aria-live="polite">
          {combinedError}
        </p>
      ) : null}

      {dragActive ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-surface-overlay/90 backdrop-blur-sm">
          <div className="rounded-3xl border border-dashed border-accent-cyan/60 bg-accent-cyan/10 px-6 py-5 text-center text-sm font-medium text-accent-cyan shadow-2xl shadow-cyan-500/30">
            Отпустите, чтобы загрузить трек
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default TrackUpload
