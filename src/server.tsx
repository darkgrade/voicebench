/** Renders each page to HTML at build time (scripts/prerender.ts), so every page is static and crawlable. */
import { App } from '@site/app'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'

export { routes, BENCH } from '@site/data'

export function render(path: string): string {
    return renderToString(
        <StrictMode>
            <App path={path} />
        </StrictMode>
    )
}
