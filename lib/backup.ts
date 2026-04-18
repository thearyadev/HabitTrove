import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import path from 'path'
import archiver from 'archiver'
import { DateTime } from 'luxon'
import { DB_PATH, DATA_DIR } from '@/lib/db/client'
import { isAutoBackupEnabled } from '@/lib/db/repos/settings'

const BACKUP_DIR = path.join(process.cwd(), 'backups')
const AVATARS_DIR = path.join(DATA_DIR, 'avatars')
const MAX_BACKUPS = 7

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true })
}

async function rotateBackups() {
  await ensureBackupDir()
  const files = await fs.readdir(BACKUP_DIR)
  const backupFiles = files
    .filter((file) => file.startsWith('backup-') && file.endsWith('.zip'))
    .map((file) => ({
      name: file,
      path: path.join(BACKUP_DIR, file),
    }))

  if (backupFiles.length <= MAX_BACKUPS) {
    return
  }

  const fileStats = await Promise.all(
    backupFiles.map(async (file) => ({
      ...file,
      stat: await fs.stat(file.path),
    })),
  )

  fileStats.sort((a, b) => a.stat.mtime.getTime() - b.stat.mtime.getTime())
  const filesToDelete = fileStats.slice(0, fileStats.length - MAX_BACKUPS)

  await Promise.all(filesToDelete.map((file) => fs.unlink(file.path)))
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

export async function runBackup() {
  if (!isAutoBackupEnabled()) {
    return
  }

  await ensureBackupDir()

  const timestamp = DateTime.now().toFormat('yyyy-MM-dd_HH-mm-ss')
  const backupFilePath = path.join(BACKUP_DIR, `backup-${timestamp}.zip`)
  const output = createWriteStream(backupFilePath)
  const archive = archiver('zip', {
    zlib: { level: 9 },
  })

  return new Promise<void>(async (resolve, reject) => {
    output.on('close', async () => {
      try {
        await rotateBackups()
        resolve()
      } catch (error) {
        reject(error)
      }
    })

    archive.on('warning', (error) => {
      if (error.code !== 'ENOENT') {
        reject(error)
      }
    })

    archive.on('error', reject)
    archive.pipe(output)

    if (await pathExists(DB_PATH)) {
      archive.file(DB_PATH, { name: 'habittrove.sqlite' })
    }

    if (await pathExists(AVATARS_DIR)) {
      archive.directory(AVATARS_DIR, 'avatars')
    }

    archive.finalize().catch(reject)
  })
}
