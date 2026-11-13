/**
 * The frame around every overview view: the bench's name, its views as tabs (each its own path,
 * so a view can be linked and prerendered), and the byline. The view fills what is left of the
 * window and scrolls inside it.
 *
 * Shared by Toolbench, Voicebench and Cambench: keep the three copies in step.
 */
import { Tabs, TabsList, TabsTrigger } from '@kevinschaich/components'
import { TYPE } from '@site/kit/theme'
import { type ReactNode, useEffect, useState } from 'react'

export interface ShellTab {
    id: string
    label: string
}

export interface ShellBench {
    name: string
    tagline: string
    repository: string
    /** Where the site is served, with slashes at both ends. */
    path: string
}

/** The view a path names: the first tab at the bench's root, another at root + id, else none (an entry's own page). */
export function tabFromPath(bench: ShellBench, tabs: ShellTab[], path: string): string | undefined {
    const id = path.replace(bench.path, '').replace(/\/$/, '')
    if (!id) return tabs[0].id
    return tabs.some(tab => tab.id === id) ? id : undefined
}

export const tabPath = (bench: ShellBench, tabs: ShellTab[], id: string): string => (id === tabs[0].id ? bench.path : `${bench.path}${id}/`)

/** The current view, kept in step with the address bar: choosing a tab pushes its path, and back and forward follow. */
export function useTab(bench: ShellBench, tabs: ShellTab[], initial: string): [string, (id: string, query?: string) => void] {
    const [tab, setTab] = useState(initial)
    useEffect(() => {
        // Links from before each view had its own path named it after a #.
        const legacy = location.hash.replace(/^#/, '')
        if (tabs.some(item => item.id === legacy)) {
            history.replaceState(null, '', tabPath(bench, tabs, legacy))
            setTab(legacy)
        }
        const onPop = () => setTab(tabFromPath(bench, tabs, location.pathname) ?? tabs[0].id)
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [bench, tabs])
    const select = (id: string, query = ''): void => {
        history.pushState(null, '', `${tabPath(bench, tabs, id)}${query}`)
        setTab(id)
    }
    return [tab, select]
}

interface ShellProps {
    bench: ShellBench
    tabs: ShellTab[]
    tab: string
    onTab: (id: string) => void
    children: ReactNode
}

export function Shell({ bench, tabs, tab, onTab, children }: ShellProps) {
    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 pt-3 pb-2 sm:px-8 sm:pt-5 sm:pb-3">
                <div className="min-w-0">
                    <h1>
                        <a href={bench.path} className={`${TYPE.title} hover:underline`}>
                            {bench.name}
                        </a>
                    </h1>
                    <p className="text-sm text-muted-foreground">{bench.tagline}</p>
                </div>
                <nav className="flex max-w-full items-center gap-2 overflow-x-auto [scrollbar-width:none]" aria-label="Views">
                    <Tabs value={tab} onValueChange={value => onTab(String(value))}>
                        <TabsList>
                            {tabs.map(item => (
                                <TabsTrigger key={item.id} value={item.id}>
                                    {item.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </nav>
            </header>
            <main className="relative min-h-0 flex-1">{children}</main>
            <footer className="px-4 py-2 sm:px-8">
                <span className="ks-byline">
                    <a href="https://darkgrade.com/">By Darkgrade</a>
                    {' · '}
                    <a href={`https://github.com/${bench.repository}`} target="_blank" rel="noopener">
                        code on github
                    </a>
                </span>
            </footer>
        </div>
    )
}

/** A view of ordinary reading (a table, the method): scrolls inside the shell, at a comfortable width. */
export function Page({ children }: { children: ReactNode }) {
    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8">{children}</div>
        </div>
    )
}

/** What a view shows while its code or data is on the way. */
export function Loading() {
    return (
        <div className="flex h-full items-center justify-center">
            <span className="size-2 animate-ping rounded-full bg-foreground/60" />
        </div>
    )
}
