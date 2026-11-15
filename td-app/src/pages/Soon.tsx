export default function Soon({ label, stage }: { label: string; stage?: number }) {
  return (
    <>
      <div className="page-head"><div><h1>{label}</h1></div></div>
      <div className="card empty">
        <div className="big">Coming in stage {stage ?? '—'}</div>
        This module is planned. Until then, keep using Diamond Track for it.
      </div>
    </>
  )
}
