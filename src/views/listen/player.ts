/**
 * Plays one recording and keeps a clock of where it is. Nothing is fetched until play is pressed;
 * before that the clock can still be moved, to step through a recording without hearing it.
 */
import { type SyntheticEvent, useCallback, useEffect, useRef, useState } from 'react'

export interface Player {
    /** Spread onto the <audio> element, with its src. */
    bind: {
        ref: React.RefObject<HTMLAudioElement | null>
        preload: 'none'
        onLoadedMetadata: (event: SyntheticEvent<HTMLAudioElement>) => void
        onTimeUpdate: (event: SyntheticEvent<HTMLAudioElement>) => void
        onEnded: () => void
        onError: () => void
    }
    /** Seconds into the recording. */
    time: number
    playing: boolean
    /** The recording couldn't be played. */
    failed: boolean
    seek: (seconds: number) => void
    toggle: () => void
    /** Stops and moves to a moment: for when the recording itself changes. */
    restart: (seconds?: number) => void
}

export function usePlayer(length: number): Player {
    const audio = useRef<HTMLAudioElement>(null)
    /** Where to start once the recording has loaded enough to be moved through. */
    const pending = useRef<number | null>(null)
    const [time, setTime] = useState(0)
    const [playing, setPlaying] = useState(false)
    const [failed, setFailed] = useState(false)

    const move = useCallback((seconds: number): void => {
        const element = audio.current
        if (element && element.readyState > 0) element.currentTime = seconds
        else pending.current = seconds
    }, [])

    const seek = useCallback(
        (seconds: number): void => {
            const clamped = Math.max(0, Math.min(length, seconds))
            setTime(clamped)
            move(clamped)
        },
        [length, move]
    )

    const toggle = useCallback((): void => {
        const element = audio.current
        if (!element) return
        if (playing) {
            element.pause()
            setPlaying(false)
            return
        }
        move(time >= length - 0.1 ? 0 : time)
        element.play().then(
            () => setPlaying(true),
            () => setFailed(true)
        )
    }, [playing, time, length, move])

    const restart = useCallback((seconds = 0): void => {
        audio.current?.pause()
        pending.current = seconds
        setPlaying(false)
        setFailed(false)
        setTime(seconds)
    }, [])

    // While playing, the recording's own clock moves the view, so it stays true when frames are skipped.
    useEffect(() => {
        if (!playing) return
        let frame = 0
        const follow = (): void => {
            if (audio.current) setTime(audio.current.currentTime)
            frame = requestAnimationFrame(follow)
        }
        frame = requestAnimationFrame(follow)
        return () => cancelAnimationFrame(frame)
    }, [playing])

    const bind: Player['bind'] = {
        ref: audio,
        preload: 'none',
        onLoadedMetadata: event => {
            if (pending.current !== null) event.currentTarget.currentTime = pending.current
            pending.current = null
        },
        // The recording reports its own progress a few times a second, which keeps the clock moving when frames aren't being drawn.
        onTimeUpdate: event => {
            if (playing) setTime(event.currentTarget.currentTime)
        },
        onEnded: () => setPlaying(false),
        onError: () => setFailed(true),
    }
    return { bind, time, playing, failed, seek, toggle, restart }
}

/** Minutes and seconds, for a recording's clock. */
export const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
