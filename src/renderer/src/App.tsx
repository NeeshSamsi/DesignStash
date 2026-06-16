import { useAppStore } from './store/app-store'

export default function App() {
  const ready = useAppStore((s) => s.ready)

  return (
    <main className="min-h-screen p-8 font-sans">
      <h1 className="text-2xl font-semibold">DesignStash</h1>
      <p className="mt-2 text-slate-500">
        Local-first mockup &amp; font organiser — foundation is up.
        {ready ? ' Ready.' : ''}
      </p>
    </main>
  )
}
