/** The reading script, bundled: its text as volunteers get it, and its lines and words as models are scored on them. */
import { readScript } from '@site/spoken'
import markdown from '/script/reading-script.md?raw'

export const SCRIPT_MARKDOWN: string = markdown
export const SCRIPT = readScript(markdown)
