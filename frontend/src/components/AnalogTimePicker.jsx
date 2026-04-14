import { useState, useRef, useCallback, useEffect } from 'react'

export default function AnalogTimePicker({ value, onChange }) {
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const parse = (v) => {
    if (!v) return { hour: 9, minute: 0, ampm: 'AM' }
    const [h, m] = v.split(':').map(Number)
    return { hour: h % 12 || 12, minute: m, ampm: h >= 12 ? 'PM' : 'AM' }
  }

  const [time, setTime] = useState(() => parse(value))
  const [mode, setMode] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 600 ? 'digital' : 'analogue'
  )

  const svgRef   = useRef(null)
  const dragging = useRef(false)

  const getH24 = (t) => {
    let h = t.hour % 12
    if (t.ampm === 'PM') h += 12
    return h
  }

  const emitTime = useCallback((t) => {
    const h24 = getH24(t)
    onChangeRef.current?.(
      `${String(h24).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
    )
  }, [])

  // Apply an updater fn to current time state, emit result
  const updateTime = useCallback((updater) => {
    setTime(prev => {
      const next = updater(prev)
      emitTime(next)
      return next
    })
  }, [emitTime])

  // ── Analogue drag ─────────────────────────────────────────────────────────

  const angleFromEvent = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top  + rect.height / 2
    const px = e.touches ? e.touches[0].clientX : e.clientX
    const py = e.touches ? e.touches[0].clientY : e.clientY
    let angle = Math.atan2(px - cx, -(py - cy)) * 180 / Math.PI
    if (angle < 0) angle += 360
    return angle
  }, [])

  const applyAngle = useCallback((angle) => {
    const newMin = Math.round(angle / 6) % 60
    updateTime(t => ({ ...t, minute: newMin }))
  }, [updateTime])

  const onDown = useCallback((e) => {
    dragging.current = true
    e.preventDefault()
    applyAngle(angleFromEvent(e))
  }, [angleFromEvent, applyAngle])

  const onMove = useCallback((e) => {
    if (!dragging.current) return
    e.preventDefault()
    applyAngle(angleFromEvent(e))
  }, [angleFromEvent, applyAngle])

  const onUp = useCallback(() => { dragging.current = false }, [])

  useEffect(() => {
    window.addEventListener('mousemove',  onMove)
    window.addEventListener('mouseup',    onUp)
    window.addEventListener('touchmove',  onMove, { passive: false })
    window.addEventListener('touchend',   onUp)
    return () => {
      window.removeEventListener('mousemove',  onMove)
      window.removeEventListener('mouseup',    onUp)
      window.removeEventListener('touchmove',  onMove)
      window.removeEventListener('touchend',   onUp)
    }
  }, [onMove, onUp])

  // ── Digital steppers ──────────────────────────────────────────────────────

  const stepHour = useCallback((delta) => {
    updateTime(t => {
      const h24  = ((getH24(t) + delta) % 24 + 24) % 24
      const hour = h24 % 12 || 12
      const ampm = h24 >= 12 ? 'PM' : 'AM'
      return { ...t, hour, ampm }
    })
  }, [updateTime])

  const stepMinute = useCallback((delta) => {
    updateTime(t => {
      const raw    = t.minute + delta
      const carry  = raw < 0 ? -1 : raw >= 60 ? 1 : 0
      const minute = ((raw % 60) + 60) % 60
      const h24    = ((getH24(t) + carry) % 24 + 24) % 24
      const hour   = h24 % 12 || 12
      const ampm   = h24 >= 12 ? 'PM' : 'AM'
      return { hour, minute, ampm }
    })
  }, [updateTime])

  const setHourDirect = (val) => {
    const h24 = Math.max(0, Math.min(23, parseInt(val) || 0))
    updateTime(t => ({
      ...t,
      hour: h24 % 12 || 12,
      ampm: h24 >= 12 ? 'PM' : 'AM',
    }))
  }

  const setMinuteDirect = (val) => {
    const m = Math.max(0, Math.min(59, parseInt(val) || 0))
    updateTime(t => ({ ...t, minute: m }))
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const { hour, minute, ampm } = time
  const h24      = getH24(time)
  const minAngle = minute * 6
  const hrAngle  = (hour % 12 + minute / 60) * 30
  const rad      = (deg) => deg * Math.PI / 180
  const mx = 100 + 70 * Math.sin(rad(minAngle))
  const my = 100 - 70 * Math.cos(rad(minAngle))
  const hx = 100 + 48 * Math.sin(rad(hrAngle))
  const hy = 100 - 48 * Math.cos(rad(hrAngle))
  const display = `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

  // ── Shared styles ─────────────────────────────────────────────────────────

  const ampmBtn = (active) => ({
    padding: '6px 18px', borderRadius: 20, border: '2px solid #6abf3f',
    background: active ? '#6abf3f' : 'transparent',
    color: active ? '#fff' : '#6abf3f',
    fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  })

  const StepBtn = ({ onClick, label }) => (
    <button onClick={onClick} style={{
      width: 40, height: 40, borderRadius: 8, border: '1.5px solid #c8dcc8',
      background: '#f0f8f0', fontSize: 22, fontWeight: 700, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#2a4a2a', lineHeight: 1, padding: 0, fontFamily: 'monospace',
    }}>{label}</button>
  )

  const numInput = {
    width: 80, height: 64, textAlign: 'center', fontSize: 32, fontWeight: 700,
    fontFamily: 'DM Mono,monospace', fontStyle: 'normal',
    border: '2px solid #6abf3f', borderRadius: 10,
    background: '#f8fbf8', color: '#1a2a1a', outline: 'none', padding: 0,
    MozAppearance: 'textfield',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>

      {/* AM / PM */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['AM', 'PM'].map(ap => (
          <button key={ap} onClick={() => updateTime(t => ({ ...t, ampm: ap }))} style={ampmBtn(ampm === ap)}>
            {ap}
          </button>
        ))}
      </div>

      {/* ── Analogue mode ── */}
      {mode === 'analogue' && (
        <>
          <svg ref={svgRef} viewBox="0 0 200 200" width="180" height="180"
            style={{ cursor: 'crosshair', touchAction: 'none', display: 'block' }}
            onMouseDown={onDown} onTouchStart={onDown}>

            <circle cx="100" cy="100" r="96" fill="#f8fbf8" stroke="#6abf3f" strokeWidth="3" />

            {Array.from({ length: 60 }, (_, i) => {
              const a     = i * 6 * Math.PI / 180
              const major = i % 5 === 0
              return (
                <line key={i}
                  x1={100 + (major ? 77 : 83) * Math.sin(a)} y1={100 - (major ? 77 : 83) * Math.cos(a)}
                  x2={100 + 91 * Math.sin(a)}                 y2={100 - 91 * Math.cos(a)}
                  stroke={major ? '#4a6a4a' : '#c8dcc8'} strokeWidth={major ? 2 : 1} />
              )
            })}

            <circle cx="100" cy="100" r="72" fill="none" stroke="#e8f4e8" strokeWidth="2" />

            {Array.from({ length: 12 }, (_, i) => {
              const h  = i + 1
              const a  = h * 30 * Math.PI / 180
              const nx = 100 + 66 * Math.sin(a)
              const ny = 100 - 66 * Math.cos(a)
              const sel = hour === h
              return (
                <g key={h}
                  onClick={e => { e.stopPropagation(); updateTime(t => ({ ...t, hour: h })) }}
                  style={{ cursor: 'pointer' }}>
                  <circle cx={nx} cy={ny} r={13} fill={sel ? '#6abf3f' : 'transparent'} />
                  <text x={nx} y={ny + 4.5} textAnchor="middle" fontSize="13"
                    fontFamily="DM Sans,sans-serif" fontWeight={sel ? 700 : 500}
                    fill={sel ? '#fff' : '#2a4a2a'}>{h}</text>
                </g>
              )
            })}

            <line x1="100" y1="100" x2={hx} y2={hy} stroke="#1a2a1a" strokeWidth="5" strokeLinecap="round" />
            <line x1="100" y1="100" x2={mx} y2={my} stroke="#6abf3f" strokeWidth="3" strokeLinecap="round" />
            <circle cx="100" cy="100" r="5" fill="#6abf3f" />
            <circle cx={mx} cy={my} r="9" fill="#6abf3f" stroke="#fff" strokeWidth="2.5" />
          </svg>

          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'DM Mono,monospace', fontStyle: 'normal',
            color: '#6abf3f', marginTop: 10, letterSpacing: '0.06em' }}>
            {display}
          </div>
        </>
      )}

      {/* ── Digital mode ── */}
      {mode === 'digital' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>

          {/* Hours column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <StepBtn onClick={() => stepHour(1)}  label="+" />
            <input type="number" min="0" max="23" value={String(h24).padStart(2, '0')}
              onChange={e => setHourDirect(e.target.value)}
              style={numInput} />
            <StepBtn onClick={() => stepHour(-1)} label="−" />
          </div>

          {/* Colon */}
          <div style={{ fontSize: 44, fontWeight: 700, color: '#6abf3f', lineHeight: 1,
            fontFamily: 'DM Mono,monospace', fontStyle: 'normal', marginTop: 2 }}>
            :
          </div>

          {/* Minutes column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <StepBtn onClick={() => stepMinute(1)}  label="+" />
            <input type="number" min="0" max="59" value={String(minute).padStart(2, '0')}
              onChange={e => setMinuteDirect(e.target.value)}
              style={numInput} />
            <StepBtn onClick={() => stepMinute(-1)} label="−" />
          </div>
        </div>
      )}

      {/* Mode toggle */}
      <button onClick={() => setMode(m => m === 'analogue' ? 'digital' : 'analogue')}
        style={{ marginTop: 10, padding: '5px 14px', borderRadius: 20,
          border: '1px solid #c8dcc8', background: '#f0f8f0', color: '#4a6a4a',
          fontFamily: 'DM Sans,sans-serif', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
        {mode === 'analogue' ? '⌨ Type time' : '🕐 Use clock'}
      </button>
    </div>
  )
}
