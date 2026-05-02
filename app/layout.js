import './globals.css'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'Reamintiri VTP - Ena Instal',
  description: 'Reamintiri SMS automate pentru verificarea centralelor pe gaz',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ro">
      <body className="min-h-screen bg-slate-100 antialiased">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
