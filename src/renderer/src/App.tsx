import { useState, useEffect } from 'react'
import { useAppStore } from './store/app-store'

export default function App() {
  const ready = useAppStore((s) => s.ready)
  const [dbStatus, setDbStatus] = useState<string>('Not tested')
  const [appInfo, setAppInfo] = useState<string>('Loading...')

  useEffect(() => {
    window.api.invoke('app:info', undefined).then((result) => {
      if (result.success) {
        setAppInfo(`${result.data.name} v${result.data.version} (${result.data.env})`)
      } else {
        setAppInfo(`Error: ${result.error.message}`)
      }
    })
  }, [])

  const testDb = async () => {
    setDbStatus('Testing...')
    try {
      const result = await window.api.invoke('db:ping', undefined)
      if (result.success) {
        setDbStatus(`Success: ${result.data.message}`)
      } else {
        setDbStatus(`Error: ${result.error.message}`)
      }
    } catch (err) {
      setDbStatus(`IPC Error: ${err}`)
    }
  }

  return (
    <main className="min-h-screen bg-neutral-900 text-slate-100 flex flex-col items-center justify-center p-8 font-sans">
      <div className="max-w-md w-full bg-neutral-800 rounded-xl shadow-2xl p-8 border border-neutral-700">
        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">DesignStash</h1>
        <p className="text-sm text-neutral-400 mb-8 font-mono">{appInfo}</p>

        <div className="space-y-6">
          <div className="bg-neutral-900/50 rounded-lg p-5 border border-neutral-700/50">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
              <span className="w-2 h-2 rounded-full bg-blue-500 mr-3"></span>
              Database Connection
            </h2>
            <div className="flex items-center justify-between">
              <button
                onClick={testDb}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-800"
              >
                Ping SQLite
              </button>
              <span
                className={`text-sm font-medium ml-4 ${dbStatus.startsWith('Success') ? 'text-green-400' : dbStatus.startsWith('Error') ? 'text-red-400' : 'text-neutral-400'}`}
              >
                {dbStatus}
              </span>
            </div>
          </div>

          <div className="bg-neutral-900/50 rounded-lg p-5 border border-neutral-700/50">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-3"></span>
              Renderer Setup
            </h2>
            <p className="text-sm text-neutral-400">
              React + Tailwind v4 + Zustand + IPC are fully operational. {ready ? 'Ready.' : ''}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
