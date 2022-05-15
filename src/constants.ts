import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'

export const TMP_FOLDER = path.join(fs.realpathSync(os.tmpdir()), randomUUID())
