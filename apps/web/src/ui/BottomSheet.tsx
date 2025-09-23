import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  title?: string
  prefersReducedMotion?: boolean
  id?: string
}

interface PointerTracker {
  startY: number
  pointerId: number | null
}

const DRAG_DISMISS_THRESHOLD = 80

const createTransition = (property: string, prefersReducedMotion?: boolean): string | undefined => {
  if (prefersReducedMotion) {
    return 'none'
  }
  return `${property} 300ms cubic-bezier(0.32, 0.72, 0, 1)`
}

const BottomSheet = ({
  open,
  onOpenChange,
  children,
  title,
  prefersReducedMotion,
  id,
}: BottomSheetProps) => {
  const tracker = useRef<PointerTracker>({ startY: 0, pointerId: null })
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const handleRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) {
      setDragOffset(0)
      setIsDragging(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [open, onOpenChange])

  const releasePointer = () => {
    const currentHandle = handleRef.current
    const pointerId = tracker.current.pointerId
    if (currentHandle && pointerId !== null) {
      try {
        currentHandle.releasePointerCapture(pointerId)
      } catch (error) {
        void error
      }
    }
    tracker.current.pointerId = null
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    tracker.current = { startY: event.clientY, pointerId: event.pointerId }
    setIsDragging(true)
    setDragOffset(0)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging) return
    const delta = event.clientY - tracker.current.startY
    if (delta > 0) {
      setDragOffset(delta)
    } else {
      setDragOffset(0)
    }
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging) return
    const delta = event.clientY - tracker.current.startY
    setIsDragging(false)
    releasePointer()
    if (delta > DRAG_DISMISS_THRESHOLD) {
      onOpenChange(false)
    }
    setDragOffset(0)
  }

  const sheetTransform = useMemo(() => {
    if (!open) {
      return 'translateY(100%)'
    }
    if (isDragging) {
      return `translateY(${Math.max(0, dragOffset)}px)`
    }
    return 'translateY(0)'
  }, [open, isDragging, dragOffset])

  const sheetStyle: CSSProperties = {
    transform: sheetTransform,
    transition: isDragging ? 'none' : createTransition('transform', prefersReducedMotion),
  }

  const overlayStyle: CSSProperties = {
    opacity: open ? 1 : 0,
    pointerEvents: open ? 'auto' : 'none',
    transition: createTransition('opacity', prefersReducedMotion),
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center md:hidden" aria-hidden={!open}>
      <div
        className="pointer-events-auto fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm"
        style={overlayStyle}
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        data-testid="bottom-sheet-overlay"
      />
      <div
        className="z-40 w-full max-w-3xl rounded-t-3xl border border-white/10 bg-slate-900/95 shadow-[0_-20px_45px_rgba(8,47,73,0.35)]"
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        id={id}
        style={sheetStyle}
        data-testid="bottom-sheet"
      >
        <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
          <button
            type="button"
            aria-label="Drag handle"
            ref={handleRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            className="mx-auto h-1.5 w-14 touch-none rounded-full bg-slate-500/60"
          />
          <div className="flex items-center justify-between">
            {title ? <h2 className="text-base font-semibold text-slate-100">{title}</h2> : null}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/60 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
              aria-label="Close controls"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto pe-2" style={{ maxHeight: '70vh' }}>
            <div className="space-y-6 pe-2">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BottomSheet
