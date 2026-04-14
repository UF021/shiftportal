import { useState, useRef, useCallback, useEffect } from 'react'

export default function AnalogTimePicker({ value, onChange }) {
  const parse = (v) => {
    if (!v) return { hour: 9, minute: 0, ampm: 'AM' }
    const [h, m] = v.split(':').map(Number)
    return { hour: h % 12 || 12, minute: m, ampm: h >= 12 ? 'PM' : 'AM' }
  }

  const [time, setTime] = useState(() => parse(value))
  const svgRef = useRef(null)
  const dragging = useRef(false)
  const c = 'var(--brand, #6abf3f)'

  const emit = (h, m, ap) => {
    let h24 = h % 12
    if (ap === 'PM') h24 += 12
    onChange?.(`${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }

  const angleFromEvent = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const px = e.touches ? e.touches[0].clientX : e.clientX
    const py = e.touches ? e.touches[0].clientY : e.clientY
    let angle = Math.atan2(px - cx, -(py - cy)) * 180 / Math.PI
    if (angle < 0) angle += 360
    return angle
  }, [])

  const applyAngle = useCallback((angle) => {
    const newMin = Math.round(angle / 6) % 60
    setTime(t => {
      emit(t.hour, newMin, t.ampm)
      return { ...t, minute: newMin }
    })
  }, [])

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
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [onMove, onUp])

  const { hour, minute, ampm } = time
  const minAngle = minute * 6
  const hrAngle  = (hour % 12 + minute / 60) * 30
  const rad = (deg) => deg * Math.PI / 180
  const mx  = 100 + 70 * Math.sin(rad(minAngle))
  const my  = 100 - 70 * Math.cos(rad(minAngle))
  const hx  = 100 + 48 * Math.sin(rad(hrAngle))
  const hy  = 100 - 48 * Math.cos(rad(hrAngle))

  let h24 = hour % 12
  if (ampm === 'PM') h24 += 12
  const display = `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', userSelect:'none' }}>
      {/* AM/PM */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        {['AM','PM'].map(ap => (
          <button key={ap} onClick={() => setTime(t => { emit(t.hour, t.minute, ap); return { ...t, ampm: ap } })}
            style={{ padding:'7px 22px', borderRadius:20, border:`2px solid #6abf3f`,
              background: ampm === ap ? '#6abf3f' : 'transparent',
              color: ampm === ap ? '#fff' : '#6abf3f',
              fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, cursor:'pointer' }}>
            {ap}
          </button>
        ))}
      </div>

      {/* Clock SVG */}
      <svg ref={svgRef} viewBox="0 0 200 200" width="220" height="220"
        style={{ cursor:'crosshair', touchAction:'none', display:'block' }}
        onMouseDown={onDown} onTouchStart={onDown}>

        {/* Face */}
        <circle cx="100" cy="100" r="96" fill="#f8fbf8" stroke="#6abf3f" strokeWidth="3" />

        {/* Tick marks */}
        {Array.from({ length: 60 }, (_, i) => {
          const a = i * 6 * Math.PI / 180
          const major = i % 5 === 0
          return (
            <line key={i}
              x1={100 + (major ? 77 : 83) * Math.sin(a)} y1={100 - (major ? 77 : 83) * Math.cos(a)}
              x2={100 + 91 * Math.sin(a)}                 y2={100 - 91 * Math.cos(a)}
              stroke={major ? '#4a6a4a' : '#c8dcc8'} strokeWidth={major ? 2 : 1} />
          )
        })}

        {/* Minute ring highlight */}
        <circle cx="100" cy="100" r="72" fill="none" stroke="#e8f4e8" strokeWidth="2" />

        {/* Hour numbers */}
        {Array.from({ length: 12 }, (_, i) => {
          const h = i + 1
          const a = h * 30 * Math.PI / 180
          const nx = 100 + 66 * Math.sin(a)
          const ny = 100 - 66 * Math.cos(a)
          const sel = hour === h
          return (
            <g key={h} onClick={e => { e.stopPropagation(); setTime(t => { emit(h, t.minute, t.ampm); return { ...t, hour: h } }) }}
              style={{ cursor:'pointer' }}>
              <circle cx={nx} cy={ny} r={13} fill={sel ? '#6abf3f' : 'transparent'} />
              <text x={nx} y={ny + 4.5} textAnchor="middle" fontSize="13"
                fontFamily="DM Sans,sans-serif" fontWeight={sel ? 700 : 500}
                fill={sel ? '#fff' : '#2a4a2a'}>
                {h}
              </text>
            </g>
          )
        })}

        {/* Hour hand */}
        <line x1="100" y1="100" x2={hx} y2={hy}
          stroke="#1a2a1a" strokeWidth="5" strokeLinecap="round" />

        {/* Minute hand */}
        <line x1="100" y1="100" x2={mx} y2={my}
          stroke="#6abf3f" strokeWidth="3" strokeLinecap="round" />

        {/* Center */}
        <circle cx="100" cy="100" r="5" fill="#6abf3f" />

        {/* Minute handle */}
        <circle cx={mx} cy={my} r="9" fill="#6abf3f" stroke="#fff" strokeWidth="2.5" />
      </svg>

      {/* Digital readout */}
      <div style={{ fontSize:38, fontWeight:700, fontFamily:'DM Mono,monospace',
        color:'#6abf3f', marginTop:10, letterSpacing:'0.06em' }}>
        {display}
      </div>
    </div>
  )
}
