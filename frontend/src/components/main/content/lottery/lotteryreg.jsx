import { useEffect, useState } from 'react'
import LotteryFiles from './lottery-files'
import NewLotteryForm from './new-lottery-form'
import { api } from './lottery-api'
import SorteoSelect from './sorteo-select'
import { ui } from './ui'

// Registrar sorteo: crea el sorteo con su grupo de sedes y carga participantes y cupos.
const LotteryReg = () => {
  const [sedes, setSedes] = useState([])
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    api.me().then((me) => setSedes(me.sedes)).catch((e) => setError(e.message))
  }, [])

  return (
    <>
      {error && <p className={ui.error}>{error}</p>}
      <NewLotteryForm
        sedes={sedes}
        onCreated={(id) => {
          setRefreshKey((k) => k + 1)
          setSelected(id)
        }}
      />
      <div className={ui.card}>
        <h2 className={ui.title}>Sorteo a configurar</h2>
        <SorteoSelect value={selected} onChange={setSelected} refreshKey={refreshKey} />
      </div>
      {selected && <LotteryFiles key={selected} idSorteos={selected} />}
    </>
  )
}

export default LotteryReg
