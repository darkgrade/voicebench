/**
 * Refuses any commit or push that could identify a volunteer. Run by the git hooks in .githooks/ and
 * in CI; there's no way back once something identifying is pushed, so everything is an allowlist:
 * anything not explicitly allowed fails.
 *
 *   bun bench/anonymity.ts --staged         what's about to be committed (pre-commit)
 *   bun bench/anonymity.ts --push           every commit about to be pushed, read from stdin (pre-push)
 *   bun bench/anonymity.ts --tree <commit>  every file in one commit (CI)
 *
 * What it checks:
 *  - recordings/ holds only speakers.json, speaker-NN.utterances.json, reviewed-speech.json and
 *    speaker-NN.wav, by exact name. No other names, no other formats (an .m4a or .mp3 can carry
 *    location, device, owner and creation date in ways that can't be verified; use
 *    `bun run publish`, which converts to a bare WAV).
 *  - A WAV is exactly RIFF/WAVE with a PCM "fmt " chunk and one "data" chunk, nothing before, between
 *    or after (no LIST/INFO, bext, iXML, ID3, XMP, cue, JUNK …), and is only committed for a speaker
 *    whose publishAudio is true.
 *  - speakers.json and the utterance files match a strict schema: only known keys, ids like speaker-01;
 *    speakers carry only an id, a file name and publishAudio: nothing about the person, no free text.
 *  - Results: speaker entries carry only allowed keys, and no speaker said words outside the script that
 *    most models agree they heard (a volunteer saying their name, a place …) unless a person reviewed
 *    them in recordings/reviewed-speech.json.
 *  - Anywhere in the repo: no audio or video files outside recordings/, and no images carrying EXIF,
 *    XMP, GPS or text metadata.
 *  - Commits that touch recordings/ or results/ (on push and in CI): authored and committed as
 *    "Voicebench <noreply@darkgrade.com>" at midnight UTC (`bun run publish` does this), so
 *    no name, email, time of day or timezone can be matched to when a volunteer sent their file. Every
 *    pushed commit's message must hold no emails, phone numbers or links.
 * Git itself stores only paths, contents and the executable bit: Finder tags, "Where from", owners and
 * file dates never leave the Mac.
 */
import { NEUTRAL_EMAIL, NEUTRAL_NAME } from '@bench/anonymity-identity'
import { execFileSync } from 'node:child_process'

type Problem = string

const SPEAKER_ID = /^speaker-\d{2}$/
const SPEAKER_KEYS = ['id', 'file', 'publishAudio']
const RESULT_SPEAKER_KEYS = [...SPEAKER_KEYS, 'audioSeconds', 'utterances', 'recordingSha256']
const RECORDING_NAMES = [/^recordings\/speakers\.json$/, /^recordings\/reviewed-speech\.json$/, /^recordings\/speaker-\d{2}\.utterances\.json$/, /^recordings\/speaker-\d{2}\.wav$/, /^recordings\/\.gitkeep$/]
const MEDIA = /\.(wav|wave|m4a|mp3|mp4|aac|aif|aiff|caf|flac|ogg|oga|opus|webm|wma|amr|3gp|mov|m4v|avi|mkv|heic|heif|tif|tiff|raw|dng)$/i
const IMAGES = /\.(jpe?g|png|gif|webp|avif)$/i

function git(...argumentsGiven: string[]): Buffer {
    return execFileSync('git', argumentsGiven, { maxBuffer: 1 << 30 })
}

/** A file's path and contents, wherever they come from (the index, or a commit). */
interface Entry {
    path: string
    read: () => Buffer
}

function stagedEntries(): Entry[] {
    const names = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').toString().split('\0').filter(Boolean)
    return names.map(path => ({ path, read: () => git('show', `:${path}`) }))
}

function treeEntries(commit: string): Entry[] {
    const names = git('ls-tree', '-r', '--name-only', '-z', commit).toString().split('\0').filter(Boolean)
    return names.map(path => ({ path, read: () => git('show', `${commit}:${path}`) }))
}

/** Every commit being pushed, from the pre-push hook's stdin ("<local ref> <local sha> <remote ref> <remote sha>"). */
function pushedCommits(stdin: string): string[] {
    const zero = /^0+$/
    const commits = new Set<string>()
    for (const line of stdin.split('\n').filter(Boolean)) {
        const [, localSha, , remoteSha] = line.split(' ')
        if (zero.test(localSha)) continue
        const range = zero.test(remoteSha) ? [localSha, '--not', '--remotes'] : [`${remoteSha}..${localSha}`]
        for (const commit of git('rev-list', ...range).toString().split('\n').filter(Boolean)) commits.add(commit)
    }
    return [...commits]
}

/** RIFF/WAVE with exactly a PCM fmt chunk and a data chunk, and no bytes before, between or after. */
function checkWav(path: string, bytes: Buffer): Problem[] {
    const problems: Problem[] = []
    if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return [`${path}: not a plain RIFF/WAVE file`]
    if (bytes.readUInt32LE(4) !== bytes.length - 8) problems.push(`${path}: RIFF size doesn't match the file (extra bytes could hide metadata)`)
    const chunks: { id: string; offset: number; size: number }[] = []
    let offset = 12
    while (offset + 8 <= bytes.length) {
        const id = bytes.toString('latin1', offset, offset + 4)
        const size = bytes.readUInt32LE(offset + 4)
        chunks.push({ id, offset, size })
        offset += 8 + size + (size % 2)
    }
    if (offset !== bytes.length) problems.push(`${path}: trailing bytes after the last chunk`)
    const ids = chunks.map(chunk => chunk.id)
    if (ids.length !== 2 || ids[0] !== 'fmt ' || ids[1] !== 'data') problems.push(`${path}: must contain only "fmt " then "data" chunks; found ${ids.map(id => JSON.stringify(id)).join(', ')}`)
    const format = chunks.find(chunk => chunk.id === 'fmt ')
    if (format) {
        const audioFormat = bytes.readUInt16LE(format.offset + 8)
        const channels = bytes.readUInt16LE(format.offset + 10)
        const bits = bytes.readUInt16LE(format.offset + 22)
        if (format.size !== 16) problems.push(`${path}: fmt chunk has ${format.size - 16} extra bytes`)
        if (audioFormat !== 1 || channels !== 1 || bits !== 16) problems.push(`${path}: must be 16-bit mono PCM (made by \`bun run publish\`)`)
    }
    return problems
}

/** JPEG without APP1 (EXIF/XMP), APP13 (IPTC) or comments; PNG without text, EXIF or time chunks; others refused. */
function checkImage(path: string, bytes: Buffer): Problem[] {
    if (/\.png$/i.test(path)) {
        const problems: Problem[] = []
        let offset = 8
        while (offset + 8 <= bytes.length) {
            const size = bytes.readUInt32BE(offset)
            const type = bytes.toString('latin1', offset + 4, offset + 8)
            if (!['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'pHYs', 'sBIT', 'bKGD'].includes(type)) problems.push(`${path}: PNG "${type}" chunk can hold metadata; strip it`)
            offset += 12 + size
        }
        return problems
    }
    if (/\.jpe?g$/i.test(path)) {
        const problems: Problem[] = []
        let offset = 2
        while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
            const marker = bytes[offset + 1]
            if (marker === 0xda) break
            const size = bytes.readUInt16BE(offset + 2)
            if (marker === 0xe1 || marker === 0xed || marker === 0xfe || (marker >= 0xe2 && marker <= 0xef && marker !== 0xe2)) problems.push(`${path}: JPEG metadata segment 0x${marker.toString(16)} (EXIF, XMP, IPTC or comment); strip it`)
            offset += 2 + size
        }
        return problems
    }
    return [`${path}: only metadata-free PNG or JPEG images are allowed`]
}

function checkSpeaker(where: string, speaker: Record<string, unknown>, allowedKeys: string[]): Problem[] {
    const problems: Problem[] = []
    for (const key of Object.keys(speaker)) if (!allowedKeys.includes(key)) problems.push(`${where}: key "${key}" isn't allowed`)
    if (typeof speaker.id !== 'string' || !SPEAKER_ID.test(speaker.id)) problems.push(`${where}: id must look like speaker-01`)
    if (speaker.file !== undefined && !(typeof speaker.file === 'string' && speaker.file === `${speaker.id}.wav`)) problems.push(`${where}: file must be "${speaker.id}.wav"`)
    if (typeof speaker.publishAudio !== 'boolean') problems.push(`${where}: publishAudio must be true or false`)
    if (allowedKeys === RESULT_SPEAKER_KEYS) {
        if (speaker.audioSeconds !== undefined && typeof speaker.audioSeconds !== 'number') problems.push(`${where}: audioSeconds must be a number`)
        if (speaker.utterances !== undefined && typeof speaker.utterances !== 'number') problems.push(`${where}: utterances must be a number`)
        if (speaker.recordingSha256 !== undefined && !(typeof speaker.recordingSha256 === 'string' && /^[0-9a-f]{64}$/.test(speaker.recordingSha256))) problems.push(`${where}: recordingSha256 must be a hash`)
    }
    return problems
}

function parseJson(path: string, bytes: Buffer): { value?: unknown; problems: Problem[] } {
    try {
        return { value: JSON.parse(bytes.toString('utf8')), problems: [] }
    } catch {
        return { problems: [`${path}: not valid JSON`] }
    }
}

function checkSpeakersFile(path: string, value: unknown): { problems: Problem[]; publishing: Set<string> } {
    const publishing = new Set<string>()
    if (!Array.isArray(value)) return { problems: [`${path}: must be a list of speakers`], publishing }
    const problems: Problem[] = []
    const seen = new Set<string>()
    value.forEach((speaker, index) => {
        if (!speaker || typeof speaker !== 'object') return problems.push(`${path}[${index}]: must be an object`)
        problems.push(...checkSpeaker(`${path}[${index}]`, speaker as Record<string, unknown>, SPEAKER_KEYS))
        const id = String((speaker as { id: unknown }).id)
        if (seen.has(id)) problems.push(`${path}: ${id} is listed twice`)
        seen.add(id)
        if ((speaker as { publishAudio?: unknown }).publishAudio === true) publishing.add(id)
    })
    return { problems, publishing }
}

function checkUtterancesFile(path: string, value: unknown): Problem[] {
    const file = value as { detector?: unknown; endOfUtteranceSeconds?: unknown; utterances?: unknown }
    const problems: Problem[] = []
    if (!file || typeof file !== 'object' || Array.isArray(file)) return [`${path}: must be an object`]
    for (const key of Object.keys(file)) if (!['detector', 'endOfUtteranceSeconds', 'utterances'].includes(key)) problems.push(`${path}: key "${key}" isn't allowed`)
    if (typeof file.detector !== 'string' || !/^silero-vad [\d.]+$/.test(file.detector)) problems.push(`${path}: detector must name the VAD and version`)
    if (typeof file.endOfUtteranceSeconds !== 'number') problems.push(`${path}: endOfUtteranceSeconds must be a number`)
    if (!Array.isArray(file.utterances)) return [...problems, `${path}: utterances must be a list`]
    for (const utterance of file.utterances) {
        const keys = Object.keys(utterance ?? {}).sort().join(',')
        if (keys !== 'endSeconds,startSeconds' || typeof utterance.startSeconds !== 'number' || typeof utterance.endSeconds !== 'number') problems.push(`${path}: each utterance must be { startSeconds, endSeconds } numbers only`)
    }
    return problems
}

interface Alignment {
    kind: string
    expected?: string
    heard?: string
}

/**
 * Words a speaker said that aren't in the script: where most models independently heard the same extra
 * word at the same place, the speaker almost certainly said it (a name, a place, an aside). Those must be
 * reviewed by a person and listed in recordings/reviewed-speech.json before they can be published.
 */
function unscriptedSpeech(models: { path: string; value: unknown }[], reviewed: Set<string>): Problem[] {
    const heardAt = new Map<string, Set<string>>()
    const modelsPerSpeaker = new Map<string, number>()
    for (const model of models) {
        const speakers = (model.value as { speakers?: { speaker: string; alignment?: Alignment[] }[] }).speakers ?? []
        for (const speaker of speakers) {
            modelsPerSpeaker.set(speaker.speaker, (modelsPerSpeaker.get(speaker.speaker) ?? 0) + 1)
            let position = 0
            for (const word of speaker.alignment ?? []) {
                if (word.kind !== 'added' && word.kind !== 'missed') position++
                if (word.kind !== 'added' && word.kind !== 'substituted') continue
                const key = `${speaker.speaker} ${position} ${word.heard}`
                if (!heardAt.has(key)) heardAt.set(key, new Set())
                heardAt.get(key)!.add(model.path)
            }
        }
    }
    const problems: Problem[] = []
    for (const [key, heardBy] of heardAt) {
        const [speaker, position, word] = key.split(' ')
        const total = modelsPerSpeaker.get(speaker) ?? 0
        if (total < 2 || heardBy.size * 2 < total) continue
        if (reviewed.has(`${speaker} ${word}`)) continue
        problems.push(`${speaker} said "${word}" (not in the script, near word ${position}; ${heardBy.size} of ${total} models heard it). Listen, and if it identifies nobody add { "speaker": "${speaker}", "word": "${word}" } to recordings/reviewed-speech.json`)
    }
    return problems
}

/**
 * Whether a path, as it is in a commit, holds anything from a volunteer: their audio, utterance timings,
 * a speaker entry or model output on their speech. Empty scaffolding (an empty list, no speakers) doesn't.
 */
function carriesParticipantData(commit: string, path: string): boolean {
    if (!path.startsWith('recordings/') && !path.startsWith('results/')) return false
    if (path.endsWith('.gitkeep')) return false
    let bytes: Buffer
    try {
        bytes = git('show', `${commit}:${path}`)
    } catch {
        return true // deleted in this commit: it held something
    }
    if (path === 'recordings/speakers.json' || path === 'recordings/reviewed-speech.json') return bytes.toString().trim() !== '[]'
    if (path === 'results/voicebench.json') {
        try {
            const results = JSON.parse(bytes.toString()) as { input?: { speakers?: unknown[] }; models?: unknown[] }
            return Boolean(results.input?.speakers?.length || results.models?.length)
        } catch {
            return true
        }
    }
    return true
}

/** A commit's identity, dates and message, for commits that carry participant data. */
function checkCommit(commit: string): Problem[] {
    const label = commit.slice(0, 10)
    const [authorName, authorEmail, authorDate, committerName, committerEmail, committerDate] = git('show', '-s', '--format=%an%n%ae%n%ad%n%cn%n%ce%n%cd', '--date=format:%H:%M:%S %z', commit).toString().split('\n')
    const message = git('show', '-s', '--format=%B', commit).toString()
    const problems: Problem[] = []
    const withoutNoReply = message.replace(/[\w.+-]*noreply@[\w.-]+|\d+\+[\w-]+@users\.noreply\.github\.com/gi, '')
    if (/[\w.+-]+@[\w-]+\.[\w.]+|https?:|www\.|\+?\d[\d ().-]{7,}\d/.test(withoutNoReply)) problems.push(`${label}: commit message contains an email, link or phone number`)
    const touched = git('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', commit).toString().split('\n').filter(Boolean)
    if (!touched.some(path => carriesParticipantData(commit, path))) return problems
    for (const [role, name, email, date] of [['author', authorName, authorEmail, authorDate], ['committer', committerName, committerEmail, committerDate]]) {
        if (name !== NEUTRAL_NAME || email !== NEUTRAL_EMAIL) problems.push(`${label}: touches recordings/ or results/, so its ${role} must be "${NEUTRAL_NAME} <${NEUTRAL_EMAIL}>" (use \`bun run publish\`), not "${name} <${email}>"`)
        if (date !== '00:00:00 +0000') problems.push(`${label}: touches recordings/ or results/, so its ${role} date must be midnight UTC (use \`bun run publish\`), not ${date}`)
    }
    return problems
}

function checkEntries(entries: Entry[], label: string): Problem[] {
    const problems: Problem[] = []
    const json = new Map<string, unknown>()
    const read = (entry: Entry): Buffer => entry.read()
    for (const entry of entries) {
        const { path } = entry
        if (path.startsWith('recordings/') && !RECORDING_NAMES.some(pattern => pattern.test(path))) problems.push(`${path}: not an allowed name in recordings/ (only speakers.json, reviewed-speech.json, speaker-NN.utterances.json, speaker-NN.wav)`)
        if (MEDIA.test(path) && !/^recordings\/speaker-\d{2}\.wav$/.test(path)) problems.push(`${path}: audio and video files may only be recordings/speaker-NN.wav`)
        if (IMAGES.test(path)) problems.push(...checkImage(path, read(entry)))
        if (/^recordings\/.*\.json$|^results\/.*\.json$/.test(path)) {
            const parsed = parseJson(path, read(entry))
            problems.push(...parsed.problems)
            if (parsed.value !== undefined) json.set(path, parsed.value)
        }
    }
    let publishing = new Set<string>()
    const speakersFile = entries.find(entry => entry.path === 'recordings/speakers.json')
    if (speakersFile && json.has(speakersFile.path)) {
        const result = checkSpeakersFile(speakersFile.path, json.get(speakersFile.path))
        problems.push(...result.problems)
        publishing = result.publishing
    }
    for (const entry of entries) {
        const match = entry.path.match(/^recordings\/(speaker-\d{2})\.wav$/)
        if (match) {
            if (!publishing.has(match[1])) problems.push(`${entry.path}: ${match[1]} hasn't agreed to publish their audio (publishAudio is not true in recordings/speakers.json)`)
            problems.push(...checkWav(entry.path, read(entry)))
        }
        if (/^recordings\/speaker-\d{2}\.utterances\.json$/.test(entry.path) && json.has(entry.path)) problems.push(...checkUtterancesFile(entry.path, json.get(entry.path)))
    }
    const results = json.get('results/voicebench.json') as { input?: { speakers?: Record<string, unknown>[] } } | undefined
    for (const [index, speaker] of (results?.input?.speakers ?? []).entries()) problems.push(...checkSpeaker(`results/voicebench.json input.speakers[${index}]`, speaker, RESULT_SPEAKER_KEYS))
    const reviewedFile = json.get('recordings/reviewed-speech.json') as { speaker: string; word: string }[] | undefined
    if (reviewedFile !== undefined && !(Array.isArray(reviewedFile) && reviewedFile.every(item => Object.keys(item).sort().join(',') === 'speaker,word' && SPEAKER_ID.test(item.speaker) && /^[a-z0-9']+$/.test(item.word)))) {
        problems.push('recordings/reviewed-speech.json: must be a list of { "speaker": "speaker-01", "word": "lowercase" }')
    }
    const reviewed = new Set((Array.isArray(reviewedFile) ? reviewedFile : []).map(item => `${item.speaker} ${item.word}`))
    const modelFiles = [...json].filter(([path]) => /^results\/models\/[^/]+\.json$/.test(path)).map(([path, value]) => ({ path, value }))
    problems.push(...unscriptedSpeech(modelFiles, reviewed))
    return problems.map(problem => `${label}: ${problem}`)
}

/** When only some files are staged, read the rest of recordings/ and results/ from the index so cross-file checks see the whole picture. */
function withIndexContext(staged: Entry[]): Entry[] {
    const stagedPaths = new Set(staged.map(entry => entry.path))
    const indexed = git('ls-files', '-z', '--', 'recordings', 'results')
        .toString()
        .split('\0')
        .filter(path => path && !stagedPaths.has(path))
        .map(path => ({ path, read: () => git('show', `:${path}`) }))
    return [...staged, ...indexed]
}

async function main(): Promise<void> {
    const mode = process.argv[2]
    let problems: Problem[] = []
    if (mode === '--staged') problems = checkEntries(withIndexContext(stagedEntries()), 'staged')
    else if (mode === '--tree') problems = [...checkEntries(treeEntries(process.argv[3] ?? 'HEAD'), process.argv[3] ?? 'HEAD'), ...checkCommit(process.argv[3] ?? 'HEAD')]
    else if (mode === '--push') {
        const stdin = await new Response(Bun.stdin.stream()).text()
        for (const commit of pushedCommits(stdin)) problems.push(...checkEntries(treeEntries(commit), commit.slice(0, 10)), ...checkCommit(commit))
    } else {
        console.error('usage: bun bench/anonymity.ts --staged | --push | --tree <commit>')
        process.exit(2)
    }
    if (problems.length) {
        console.error(`\nAnonymity check failed. Nothing identifying may be committed or pushed:\n\n${[...new Set(problems)].map(problem => `  ✗ ${problem}`).join('\n')}\n`)
        process.exit(1)
    }
    console.log('Anonymity check passed.')
}

await main()
