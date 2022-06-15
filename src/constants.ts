import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'

export const TMP_FOLDER = path.join(fs.realpathSync(os.tmpdir()), randomUUID())

/**
 * @fig/eslint-config-autocomplete is configured using `overrides` and `files` so specs to be linted need to reflect the autocomplete repo
 * So "normal" specs HAVE to be under a src/ folder and diff-based versioned HAVE to be under a subfolder of src/
 */
export const TMP_AUTOCOMPLETE_SRC_MOCK = path.join(TMP_FOLDER, 'src')
