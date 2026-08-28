import { useEffect, useState } from 'react'
import api from '../../api/client'

const PLAN_COLOUR = {
  trial:      { bg: '#f1f5f9', border: '#cbd5e1', text: '#475569', badge: '#64748b' },
  starter:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', badge: '#3b82f6' },
  growth:     { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', badge: '#22c55e' },
  enterprise: { bg: '#faf5ff', border: '#e9d5ff', text: '#6b21a8', badge: '#a855f7' },
  hybrid:     { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412', badge: '#f97316' },
}

const PLAN_ORDER = ['trial', 'starter', 'growth', 'enterprise', 'hybrid']

function UsageBar({ label, used, limit, colour }) {
  const pct   = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const warn  = limit && pct >= 80
  const over  = limit && used >= limit
  const bar   = over ? '#ef4444' : warn ? '#f59e0b' : colour || '#22c55e'
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        <span style={{ fontSize: 13, fontFamily: 'DM Mono,monospace', color: over ? '#ef4444' : 'var(--text-muted)' }}>
          {used} / {limit ?? '∞'}
          {limit && <span style={{ fontSize: 11, marginLeft: 6, color: 'var(--text-dim)' }}>({pct}%)</span>}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--navy-light)', overflow: 'hidden' }}>
        {limit
          ? <div style={{ height: '100%', width: `${pct}%`, background: bar, borderRadius: 4, transition: 'width .4s' }} />
          : <div style={{ height: '100%', width: '100%', background: `repeating-linear-gradient(90deg,${bar}33 0,${bar}33 8px,transparent 8px,transparent 16px)`, borderRadius: 4 }} />
        }
      </div>
      {over && (
        <div style={{ marginTop: 5, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
          ⚠ Limit reached — upgrade your plan or purchase add-ons to add more.
        </div>
      )}
      {warn && !over && (
        <div style={{ marginTop: 5, fontSize: 12, color: '#f59e0b' }}>
          Approaching limit — consider upgrading soon.
        </div>
      )}
    </div>
  )
}

function FeatureRow({ label, included }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 16, flexShrink: 0, color: included ? '#22c55e' : '#94a3b8' }}>
        {included ? '✅' : '⬜'}
      </span>
      <span style={{ fontSize: 13, color: included ? 'var(--text)' : 'var(--text-dim)', fontWeight: included ? 500 : 400 }}>
        {label}
      </span>
    </div>
  )
}

function PlanCard({ plan, current }) {
  const id     = plan.id
  const col    = PLAN_COLOUR[id] || PLAN_COLOUR.starter
  const active = current === id
  return (
    <div style={{
      border: `2px solid ${active ? col.badge : 'var(--border)'}`,
      borderRadius: 12, padding: '18px 20px', position: 'relative',
      background: active ? col.bg.replace('ff', 'dd') : 'var(--navy-mid)',
      transition: 'border-color .2s',
    }}>
      {active && (
        <div style={{
          position: 'absolute', top: -12, left: 16,
          background: col.badge, color: '#fff',
          fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, letterSpacing: '.06em',
        }}>
          CURRENT PLAN
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: active ? col.text : 'var(--text)' }}>{plan.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{plan.price_note}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-dim)' }}>
          <div>{plan.staff_limit ? `${plan.staff_limit} staff` : 'Unlimited staff'}</div>
          <div>{plan.site_limit  ? `${plan.site_limit} sites`  : 'Unlimited sites'}</div>
        </div>
      </div>
      {plan.extra_staff_gbp && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
          Add-ons: +£{plan.extra_staff_gbp}/staff · +£{plan.extra_site_gbp}/site per month
        </div>
      )}
      <div>
        {Object.entries(plan.features).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: val ? '#22c55e' : '#475569' }}>{val ? '✓' : '–'}</span>
            <span style={{ fontSize: 12, color: val ? 'var(--text-muted)' : 'var(--text-dim)' }}>
              {plan.feature_labels?.[key] || key}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HRBilling() {
  const [sub,     setSub]     = useState(null)
  const [plans,   setPlans]   = useState([])
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/billing/my-subscription'),
      api.get('/billing/plans'),
    ])
      .then(([subRes, planRes]) => {
        setSub(subRes.data)
        setPlans(planRes.data.plans || [])
      })
      .catch(() => setErr('Failed to load billing information.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading…</div>
  if (err)     return <div style={{ color: '#ef4444', padding: 40 }}>{err}</div>
  if (!sub)    return null

  const col        = PLAN_COLOUR[sub.plan_id] || PLAN_COLOUR.trial
  const orderedPlans = PLAN_ORDER.map(id => plans.find(p => p.id === id)).filter(Boolean)

  const trialDaysLeft = sub.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - Date.now()) / 86400000))
    : null

  return (
    <>
      <div style={{ marginBottom: 26 }}>
        <h2 style={{ fontSize: 23, fontWeight: 700, marginBottom: 4 }}>Billing & Plan</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Your current subscription, usage, and available plans
        </p>
      </div>

      {/* Current plan banner */}
      <div className="card" style={{
        border: `2px solid ${col.badge}`,
        marginBottom: 24,
        background: 'var(--navy-mid)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              background: col.badge, color: '#fff',
              fontSize: 13, fontWeight: 800, padding: '6px 14px', borderRadius: 20,
            }}>
              {sub.plan_name.toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{sub.price_note}</div>
              {sub.status && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>
                  Status: {sub.status}
                  {trialDaysLeft !== null && ` · ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining`}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled
              title="Online billing coming soon — contact support to upgrade"
              style={{
                padding: '9px 18px', borderRadius: 8, border: `1px solid ${col.badge}`,
                background: 'transparent', color: col.badge,
                fontSize: 13, fontWeight: 700, cursor: 'not-allowed', opacity: 0.6,
                fontFamily: 'DM Sans,sans-serif',
              }}
            >
              Upgrade Plan
            </button>
            <button
              disabled
              title="Online billing coming soon"
              style={{
                padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)',
                fontSize: 13, cursor: 'not-allowed', opacity: 0.6,
                fontFamily: 'DM Sans,sans-serif',
              }}
            >
              Manage Billing
            </button>
          </div>
        </div>

        {!sub.stripe_active && (
          <div style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)',
            fontSize: 13, color: '#d97706',
          }}>
            💳 Online billing is not yet active. To change your plan, contact{' '}
            <strong>support@ikanfm.co.uk</strong>
          </div>
        )}
      </div>

      {/* Usage */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18, marginTop: 0 }}>Usage</h3>
        <UsageBar
          label="Active Staff"
          used={sub.active_staff}
          limit={sub.staff_limit}
          colour={col.badge}
        />
        <UsageBar
          label="Active Sites"
          used={sub.active_sites}
          limit={sub.site_limit}
          colour={col.badge}
        />
        {(sub.extra_staff > 0 || sub.extra_sites > 0) && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
            Includes {sub.extra_staff > 0 ? `${sub.extra_staff} add-on staff seat${sub.extra_staff !== 1 ? 's' : ''}` : ''}
            {sub.extra_staff > 0 && sub.extra_sites > 0 ? ' and ' : ''}
            {sub.extra_sites > 0 ? `${sub.extra_sites} add-on site${sub.extra_sites !== 1 ? 's' : ''}` : ''}
          </div>
        )}
      </div>

      {/* Features on current plan */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, marginTop: 0 }}>Your Plan Features</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          What's included in your <strong>{sub.plan_name}</strong> plan
        </p>
        {Object.entries(sub.features).map(([key, val]) => (
          <FeatureRow key={key} label={sub.feature_labels?.[key] || key} included={val} />
        ))}
      </div>

      {/* Plan comparison */}
      <div style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Available Plans</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
          To upgrade, contact <strong>support@ikanfm.co.uk</strong> — online self-service coming soon.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {orderedPlans.map(p => (
            <PlanCard key={p.id} plan={p} current={sub.plan_id} />
          ))}
        </div>
      </div>
    </>
  )
}
