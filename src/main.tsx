import { App } from '@site/app'
import '@site/styles.css'
import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

const root = document.getElementById('root')!
const app = (
    <StrictMode>
        <App path={location.pathname} />
    </StrictMode>
)
// Built pages arrive prerendered and are hydrated; the dev server renders fresh.
if (root.hasChildNodes()) hydrateRoot(root, app)
else createRoot(root).render(app)
