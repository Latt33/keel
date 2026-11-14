import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'

// StrictMode is off on purpose: its double mount drops one of drei's <Html> labels under React 19.
createRoot(document.getElementById('root')!).render(<App />)
