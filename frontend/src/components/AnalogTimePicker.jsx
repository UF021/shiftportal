import { useState, useRef, useEffect, useCallback } from 'react'
import { useBrand } from '../api/BrandContext'

// ── Clock geometry helpers (module level) ─────────────────────────────────────

const CX = 140, CY = 140, NR = 100  // centre coords, number radius

function polarXY(deg, radius) {
  const rad = (deg - 90) * Math.PI / 180
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) }
}

const HOUR_POSITIONS = Array.from({ length: 12 }, (_, i) => {
  const h = i + 1
  return { h, ...polarXY(h * 30, NR) }
})

const MINUTE_POSITIONS = Array.from({ length: 12 }, (_, i) => {
  const m = i * 5
  return { m, ...polarXY(m * 6, NR) }
})

function parseValue(v) {
  if (!v) return { h24: 9, minute: 0 }
  const [h, m] = v.split(':').map(Number)
  return { h24: isNaN(h) ? 9 : h % 24, minute: isNaN(m) ? 0 : m % 60 }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AnalogTimePicker({ value, onChange }) {
  const { colour } = useBrand()
  const c = colour || '#6abf3f'

  const { h24: initH, minute: initM } = parseValue(value)

  const [h24,     setH24]     = useState(initH)
  const [minute,  setMinute]  = useState(initM)
  const [selMode, setSelMode] = useState('hours')   // 'hours' | 'minutes'
  const [kbMode,  setKbMode]  = useState(false)
  const [kbH,     setKbH]     = useState(String(initH).padStart(2, '0'))
  const [kbM,     setKbM]     = useState(String(initM).padStart(2, '0'))

  // Keep a ref of current state for use inside event handlers
  const stRef = useRef({ h24, minute, selMode })
  useEffect(() => { stRef.current = { h24, minute, selMode } }, [h24, minute, selMode])

  const svgRef    = useRef(null)
  const dragging  = useRef(false)
  const hasMoved  = useRef(false)

  const ampm   = h24 >= 12 ? 'PM' : 'AM'
  const hour12 = h24 % 12 || 12

  // ── Clock hand ─────────────────────────────────────────────────────────────

  const handEnd = selMode === 'hours'
    ? polarXY(hour12 * 30, NR)
    : polarXY(minute * 6,  NR)

  // ── Drag ──────────────────────────────────────────────────────────────────

  const angleFrom = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top  + rect.height / 2
    const px = e.touches ? e.touches[0].clientX : e.clientX
    const py = e.touches ? e.touches[0].clientY : e.clientY
    let a = Math.atan2(px - cx, -(py - cy)) * 180 / Math.PI
    if (a < 0) a += 360
    return a
  }, [])

  const applyAngle = useCallback((angle) => {
    const { selMode: sm, h24: cur24 } = stRef.current
    if (sm === 'hours') {
      const h12   = Math.round(angle / 30) % 12 || 12
      const newH  = cur24 >= 12 ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12)
      setH24(newH)
    } else {
      setMinute(Math.round(angle / 6) % 60)
    }
  }, [])

  const onDown = useCallback((e) => {
    dragging.current = true
    hasMoved.current = false
    e.preventDefault()
    applyAngle(angleFrom(e))
  }, [angleFrom, applyAngle])

  const onMove = useCallback((e) => {
    if (!dragging.current) return
    hasMoved.current = true
    e.preventDefault()
    applyAngle(angleFrom(e))
  }, [angleFrom, applyAngle])

  const onUp = useCallback(() => {
    if (dragging.current && !hasMoved.current && stRef.current.selMode === 'hours') {
      setSelMode('minutes')
    }
    dragging.current = false
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend',  onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onUp)
    }
  }, [onMove, onUp])

  // ── AM/PM toggle ───────────────────────────────────────────────────────────

  function toggleAmPm(ap) {
    if (ap === 'AM' && h24 >= 12) setH24(h24 - 12)
    if (ap === 'PM' && h24 <  12) setH24(h24 + 12)
  }

  // ── OK / CANCEL ────────────────────────────────────────────────────────────

  function handleOk() {
    let fh = h24, fm = minute
    if (kbMode) {
      fh = Math.max(0, Math.min(23, parseInt(kbH) || 0))
      fm = Math.max(0, Math.min(59, parseInt(kbM) || 0))
    }
    onChange?.(`${String(fh).padStart(2,'0')}:${String(fm).padStart(2,'0')}`)
  }

  function handleCancel() {
    const { h24: oh, minute: om } = parseValue(value)
    setH24(oh); setMinute(om)
    setKbH(String(oh).padStart(2,'0'))
    setKbM(String(om).padStart(2,'0'))
    setSelMode('hours')
    setKbMode(false)
  }

  // ── Click a number directly ───────────────────────────────────────────────

  function clickHour(h) {
    const newH = h24 >= 12 ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h)
    setH24(newH)
    setSelMode('minutes')
  }

  function clickMinute(m) {
    setMinute(m)
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const displayH = String(h24).padStart(2, '0')
  const displayM = String(minute).padStart(2, '0')

  const segStyle = (active) => ({
    fontSize: 52, fontWeight: 700, fontFamily: 'DM Mono,monospace', fontStyle: 'normal',
    color:      active ? '#fff' : '#1a2a1a',
    background: active ? c     : '#f0f4f0',
    borderRadius: 10, padding: '0 12px', lineHeight: '68px', height: 68,
    cursor: 'pointer', transition: 'all .15s',
    minWidth: 68, textAlign: 'center', display: 'inline-block',
    userSelect: 'none',
  })

  const ampmBtnStyle = (active) => ({
    padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
    border:     `1.5px solid ${active ? c : '#ccc'}`,
    background: active ? c : 'transparent',
    color:      active ? '#fff' : '#888',
    cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', transition: 'all .15s',
  })

  return (
    <div style={{ background:'#fff', borderRadius:16, padding:'20px 20px 14px', maxWidth:320, width:'100%', userSelect:'none', boxShadow:'0 4px 24px rgba(0,0,0,.12)' }}>

      {/* ── Digital display ──────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:14 }}>

        <div onClick={() => setSelMode('hours')} style={segStyle(selMode === 'hours')}>{displayH}</div>

        <div style={{ fontSize:44, fontWeight:700, fontFamily:'DM Mono,monospace', color:'#1a2a1a', lineHeight:1, paddingBottom:4 }}>:</div>

        <div onClick={() => setSelMode('minutes')} style={segStyle(selMode === 'minutes')}>{displayM}</div>

        <div style={{ display:'flex', flexDirection:'column', gap:5, marginLeft:6 }}>
          {['AM','PM'].map(ap => (
            <button key={ap} onClick={() => toggleAmPm(ap)} style={ampmBtnStyle(ampm === ap)}>{ap}</button>
          ))}
        </div>
      </div>

      {/* ── Clock face or keyboard ────────────────────────────────────────── */}
      {!kbMode ? (
        <svg ref={svgRef} viewBox="0 0 280 280" width="280" height="280"
          style={{ display:'block', margin:'0 auto', cursor:'crosshair', touchAction:'none' }}
          onMouseDown={onDown} onTouchStart={onDown}>

          {/* Clock circle */}
          <circle cx={CX} cy={CY} r="120" fill="#f5f5f5" />

          {/* Hand */}
          <line x1={CX} y1={CY} x2={handEnd.x} y2={handEnd.y}
            stroke={c} strokeWidth="3" strokeLinecap="round" />
          <circle cx={CX} cy={CY} r="5" fill={c} />
          <circle cx={handEnd.x} cy={handEnd.y} r="22" fill={c} opacity="0.18" />
          <circle cx={handEnd.x} cy={handEnd.y} r="12" fill={c} />

          {/* Hour or minute numbers */}
          {selMode === 'hours'
            ? HOUR_POSITIONS.map(({ h, x, y }) => {
                const sel = hour12 === h
                return (
                  <g key={h} onClick={e => { e.stopPropagation(); clickHour(h) }} style={{ cursor:'pointer' }}>
                    <text x={x} y={y + 5.5} textAnchor="middle" fontSize="16"
                      fontFamily="DM Sans,sans-serif" fontWeight={sel ? 700 : 400}
                      fill={sel ? '#fff' : '#333'}>{h}</text>
                  </g>
                )
              })
            : MINUTE_POSITIONS.map(({ m, x, y }) => {
                const sel = minute === m
                return (
                  <g key={m} onClick={e => { e.stopPropagation(); clickMinute(m) }} style={{ cursor:'pointer' }}>
                    <text x={x} y={y + 5.5} textAnchor="middle" fontSize="14"
                      fontFamily="DM Sans,sans-serif" fontWeight={sel ? 700 : 400}
                      fill={sel ? '#fff' : '#333'}>{String(m).padStart(2,'0')}</text>
                  </g>
                )
              })
          }
        </svg>
      ) : (
        /* Keyboard mode */
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'center', gap:8, padding:'28px 0 24px' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#999', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Hours</div>
            <input type="number" min="0" max="23" value={kbH} onChange={e => setKbH(e.target.value)}
              style={{ width:80, height:64, textAlign:'center', fontSize:36, fontWeight:700,
                fontFamily:'DM Mono,monospace', fontStyle:'normal',
                border:'none', borderBottom:`3px solid ${c}`, borderRadius:0,
                background:'#f5f5f5', color:'#1a2a1a', outline:'none', padding:0 }} />
          </div>
          <div style={{ fontSize:44, fontWeight:700, fontFamily:'DM Mono,monospace', color:'#1a2a1a', lineHeight:1, paddingBottom:10 }}>:</div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#999', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Minutes</div>
            <input type="number" min="0" max="59" value={kbM} onChange={e => setKbM(e.target.value)}
              style={{ width:80, height:64, textAlign:'center', fontSize:36, fontWeight:700,
                fontFamily:'DM Mono,monospace', fontStyle:'normal',
                border:'none', borderBottom:`3px solid ${c}`, borderRadius:0,
                background:'#f5f5f5', color:'#1a2a1a', outline:'none', padding:0 }} />
          </div>
        </div>
      )}

      {/* ── Bottom row: keyboard toggle + CANCEL / OK ─────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:12, borderTop:'1px solid #f0f0f0', marginTop:4 }}>
        <button onClick={() => setKbMode(m => !m)}
          style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 6px', borderRadius:6, color:'#666', fontSize:22, lineHeight:1 }}>
          ⌨
        </button>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={handleCancel}
            style={{ padding:'8px 18px', borderRadius:8, border:'none', background:'none', color:'#666', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            CANCEL
          </button>
          <button onClick={handleOk}
            style={{ padding:'8px 20px', borderRadius:8, border:'none', background:c, color:'#fff', fontFamily:'DM Sans,sans-serif', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
