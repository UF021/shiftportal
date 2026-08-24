import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBrand } from '../../api/BrandContext'
import { importStaffCSV } from '../../api/client'

const COLUMNS = [
  { key: 'first_name',            label: 'First Name',          required: true  },
  { key: 'last_name',             label: 'Last Name',           required: true  },
  { key: 'email',                 label: 'Email',               required: true  },
  { key: 'phone',                 label: 'Phone',               required: false },
  { key: 'date_of_birth',         label: 'Date of Birth',       required: false },
  { key: 'nationality',           label: 'Nationality',         required: false },
  { key: 'ni_number',             label: 'NI Number',           required: false },
  { key: 'sia_licence',           label: 'SIA Licence No.',     required: false },
  { key: 'sia_expiry',            label: 'SIA Expiry',          required: false },
  { key: 'address_line1',         label: 'Address Line 1',      required: false },
  { key: 'address_line2',         label: 'Address Line 2',      required: false },
  { key: 'city',                  label: 'City',                required: false },
  { key: 'postcode',              label: 'Postcode',            required: false },
  { key: 'staff_id',              label: 'Staff ID',            required: false },
  { key: 'employment_start_date', label: 'Employment Start',    required: false },
  { key: 'nok_name',              label: 'Next of Kin Name',    required: false },
  { key: 'nok_phone',             label: 'Next of Kin Phone',   required: false },
  { key: 'nok_relation',          label: 'Relationship',        required: false },
]

const DATE_FIELDS = new Set(['date_of_birth', 'sia_expiry', 'employment_start_date'])
const EMAIL_RE    = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/

// ── CSV parser (handles quoted fields with embedded commas / newlines) ──────

function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuote = false
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuote) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') { inQuote = false }
      else { field += ch }
    } else {
      if (ch === '"') { inQuote = true }
      else if (ch === ',') { row.push(field.trim()); field = '' }
      else if (ch === '\n') {
        row.push(field.trim()); field = ''
        if (row.some(v => v !== '')) rows.push(row)
        row = []
      } else { field += ch }
    }
  }
  row.push(field.trim())
  if (row.some(v => v !== '')) rows.push(row)
  return rows
}

function csvToObjects(text) {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.toLowerCase().trim().replace(/\s+/g, '_'))
  return rows.slice(1).map((row, i) =>
    Object.fromEntries(headers.map((h, j) => [h, (row[j] || '').trim()]))
  )
}

// ── Validate a single parsed row ─────────────────────────────────────────────

function validateRow(row) {
  const issues = []
  if (!row.first_name) issues.push('Missing first name')
  if (!row.last_name)  issues.push('Missing last name')
  if (!row.email)      issues.push('Missing email')
  else if (!EMAIL_RE.test(row.email)) issues.push('Invalid email format')
  for (const f of DATE_FIELDS) {
    if (row[f] && !DATE_RE.test(row[f])) issues.push(`${f}: must be YYYY-MM-DD`)
  }
  return issues
}

// ── Template download ────────────────────────────────────────────────────────

function downloadTemplate() {
  const headers = COLUMNS.map(c => c.key)
  const example = [
    'John', 'Smith', 'john.smith@example.com', '07700 900000',
    '1990-01-15', 'British', 'AB123456C',
    'SIA1234567', '2026-12-31', '12 High Street', 'Flat 2',
    'London', 'SW1A 1AA', 'JS001', '2024-01-01',
    'Jane Smith', '07700 900111', 'Spouse',
  ]
  const csv = [headers.join(','), example.join(',')].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = 'staff-import-template.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HRImportCSV() {
  const { colour } = useBrand()
  const nav        = useNavigate()
  const c          = colour || '#6abf3f'
  const fileRef    = useRef(null)

  const [step,     setStep]     = useState('upload')   // upload | preview | done
  const [rows,     setRows]     = useState([])
  const [dragging, setDragging] = useState(false)
  const [importing,setImporting]= useState(false)
  const [result,   setResult]   = useState(null)
  const [err,      setErr]      = useState('')

  function processFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
      setErr('Please upload a .csv file.')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const objects = csvToObjects(e.target.result)
      if (!objects.length) { setErr('The file appears to be empty or has no data rows.'); return }
      setRows(objects.map((r, i) => ({ ...r, _row: i + 2, _issues: validateRow(r) })))
      setErr('')
      setStep('preview')
    }
    reader.readAsText(file)
  }

  function onFileChange(e) { processFile(e.target.files[0]) }
  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    processFile(e.dataTransfer.files[0])
  }

  const validRows   = rows.filter(r => r._issues.length === 0)
  const invalidRows = rows.filter(r => r._issues.length > 0)

  async function doImport() {
    setImporting(true); setErr('')
    try {
      const payload = validRows.map(r => {
        const obj = {}
        COLUMNS.forEach(col => { obj[col.key] = r[col.key] || null })
        return obj
      })
      const res = await importStaffCSV(payload)
      setResult(res.data)
      setStep('done')
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setStep('upload'); setRows([]); setResult(null); setErr('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const cardStyle = {
    background: 'var(--navy-mid)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '20px 24px', marginBottom: 16,
  }

  // ── Upload step ──────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => nav('/hr/staff')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', padding: '4px 8px 4px 0' }}>←</button>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Bulk Staff Import</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Import multiple staff records from a CSV file</div>
          </div>
        </div>

        {/* Info card */}
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>How it works</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <li>Download the CSV template and fill in your staff data (one row per person)</li>
            <li>Required fields: <strong style={{ color: 'var(--text)' }}>first_name, last_name, email</strong></li>
            <li>Dates must be in <strong style={{ color: 'var(--text)' }}>YYYY-MM-DD</strong> format (e.g. 2026-12-31)</li>
            <li>Staff are created as active records — they use "Forgot Password" to set up their login</li>
            <li>Rows with duplicate emails (already in your portal) are automatically skipped</li>
          </ul>
          <button onClick={downloadTemplate} style={{
            marginTop: 14, padding: '8px 16px', borderRadius: 8,
            border: `1px solid ${c}`, background: 'transparent', color: c,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
          }}>
            ⬇ Download CSV Template
          </button>
        </div>

        {/* Upload area */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            background: dragging ? c + '18' : 'var(--navy-mid)',
            border: `2px dashed ${dragging ? c : 'var(--border)'}`,
            borderRadius: 12, padding: '48px 24px', textAlign: 'center',
            cursor: 'pointer', transition: 'all .2s',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>📁</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Drag & drop your CSV here
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>or click to browse</div>
          <input ref={fileRef} type="file" accept=".csv" onChange={onFileChange} style={{ display: 'none' }} />
        </div>

        {err && <div style={{ marginTop: 12, fontSize: 13, color: '#fca5a5' }}>{err}</div>}
      </div>
    )
  }

  // ── Preview step ─────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', padding: '4px 8px 4px 0' }}>←</button>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Preview Import</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {rows.length} row(s) found · {validRows.length} valid · {invalidRows.length} with errors
            </div>
          </div>
        </div>

        {/* Summary badges */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(22,163,74,.15)', border: '1px solid #16a34a', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#86efac' }}>
            ✓ {validRows.length} will be imported
          </div>
          {invalidRows.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,.15)', border: '1px solid #ef4444', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>
              ✗ {invalidRows.length} have errors (will be skipped)
            </div>
          )}
        </div>

        {err && (
          <div style={{ background: '#2d1515', border: '1px solid #e05555', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5', marginBottom: 14 }}>{err}</div>
        )}

        {/* Table */}
        <div style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--navy)', borderBottom: '1px solid var(--border)' }}>
                  <th style={th}>#</th>
                  <th style={th}>Status</th>
                  <th style={th}>Name</th>
                  <th style={th}>Email</th>
                  <th style={th}>SIA Licence</th>
                  <th style={th}>SIA Expiry</th>
                  <th style={th}>NI Number</th>
                  <th style={th}>Staff ID</th>
                  <th style={th}>Issue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const ok = r._issues.length === 0
                  return (
                    <tr key={r._row} style={{ borderBottom: '1px solid var(--border)', background: ok ? 'transparent' : 'rgba(239,68,68,.06)' }}>
                      <td style={td}>{r._row}</td>
                      <td style={td}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: ok ? 'rgba(22,163,74,.15)' : 'rgba(239,68,68,.15)', color: ok ? '#86efac' : '#fca5a5' }}>
                          {ok ? 'OK' : 'ERROR'}
                        </span>
                      </td>
                      <td style={td}>{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                      <td style={td}>{r.email || '—'}</td>
                      <td style={td}>{r.sia_licence || '—'}</td>
                      <td style={td}>{r.sia_expiry || '—'}</td>
                      <td style={td}>{r.ni_number || '—'}</td>
                      <td style={td}>{r.staff_id || '—'}</td>
                      <td style={{ ...td, color: '#fca5a5' }}>{r._issues.join('; ') || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={reset} style={{
            padding: '11px 20px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', fontSize: 13,
            cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
          }}>← Upload different file</button>
          <button onClick={doImport} disabled={importing || validRows.length === 0} style={{
            flex: 1, padding: '11px', borderRadius: 8, border: 'none',
            background: validRows.length === 0 ? '#333' : c,
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: (importing || validRows.length === 0) ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans,sans-serif', opacity: importing ? 0.7 : 1,
          }}>
            {importing ? 'Importing…' : `Import ${validRows.length} staff record(s)`}
          </button>
        </div>
      </div>
    )
  }

  // ── Done step ────────────────────────────────────────────────────────────
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 20px', color: 'var(--text)' }}>Import Complete</h2>

      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, textAlign: 'center' }}>
          {[
            { val: result?.created, label: 'Records created', col: '#86efac' },
            { val: result?.skipped, label: 'Skipped (duplicates)', col: 'var(--text-muted)' },
            { val: result?.errors?.length, label: 'Row errors', col: result?.errors?.length > 0 ? '#fca5a5' : 'var(--text-muted)' },
          ].map(({ val, label, col }) => (
            <div key={label}>
              <div style={{ fontSize: 32, fontWeight: 900, fontFamily: 'DM Mono,monospace', color: col }}>{val ?? 0}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {result?.created > 0 && (
        <div style={{ ...cardStyle, borderLeft: `4px solid ${c}`, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>Next steps:</strong> imported staff have been added to Staff Records as active. Share your portal login URL with them and ask them to use "Forgot Password" to set their own password.
        </div>
      )}

      {result?.errors?.length > 0 && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5', marginBottom: 10 }}>Rows with errors (not imported)</div>
          {result.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              Row {e.row} · {e.email || 'no email'} — {e.reason}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={reset} style={{
          padding: '11px 20px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text-muted)', fontSize: 13,
          cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
        }}>Import another file</button>
        <button onClick={() => nav('/hr/staff')} style={{
          padding: '11px 20px', borderRadius: 8, border: 'none',
          background: c, color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
        }}>View Staff Records →</button>
      </div>
    </div>
  )
}

const th = {
  padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em',
  whiteSpace: 'nowrap',
}
const td = {
  padding: '8px 12px', color: 'var(--text)', verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}
