import { App } from '@site/app'
import '@site/styles.css'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'

hydrateRoot(
    document.getElementById('root')!,
    <StrictMode>
        <App path={location.pathname} />
    </StrictMode>
)
