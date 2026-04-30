import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getOrgDocs } from './client'

const DocsCtx = createContext({
  docs:            [],
  unconfirmedDocs: [],
  unconfirmedCount: 0,
  loading:         true,
  markConfirmed:   () => {},
  refetch:         () => {},
})

export function DocsProvider({ children }) {
  const [docs,    setDocs]    = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    getOrgDocs()
      .then(r => setDocs(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  function markConfirmed(doc_key) {
    setDocs(prev => prev.map(d =>
      d.doc_key === doc_key
        ? { ...d, confirmed: true, confirmed_at: new Date().toISOString() }
        : d
    ))
  }

  const unconfirmedDocs  = docs.filter(d => (d.has_file || d.doc_url) && !d.confirmed)
  const unconfirmedCount = unconfirmedDocs.length

  return (
    <DocsCtx.Provider value={{ docs, unconfirmedDocs, unconfirmedCount, loading, markConfirmed, refetch: fetch }}>
      {children}
    </DocsCtx.Provider>
  )
}

export const useDocs = () => useContext(DocsCtx)
