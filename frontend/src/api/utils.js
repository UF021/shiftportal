export function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const date    = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${weekday} ${date}`
}

export function fmtDateTime(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const date    = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${weekday} ${date} ` + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function fmtUKTime(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtUKDateTime(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
