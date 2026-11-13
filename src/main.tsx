import { modelFromPath } from '@site/data'
import '@site/styles.css'
import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

// A model's page and the overview load separately, so neither carries the other's code or data.
const model = modelFromPath(location.pathname)
async function entry(found: NonNullable<typeof model>) {
    const [{ Entry }, detail] = await Promise.all([import('@site/entry'), import('@site/details').then(({ loadDetail }) => loadDetail(found.id))])
    return <Entry model={found} detail={detail} />
}
const page = model ? await entry(model) : await import('@site/app').then(({ Overview }) => <Overview path={location.pathname} />)

const root = document.getElementById('root')!
const app = <StrictMode>{page}</StrictMode>
// Built pages arrive prerendered and are hydrated; the dev server renders fresh.
if (root.hasChildNodes()) hydrateRoot(root, app)
else createRoot(root).render(app)
