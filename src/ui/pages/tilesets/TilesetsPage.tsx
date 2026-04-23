import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../../theme'
import { useTilesetsStore, type DownloadState, type TilesetMeta } from '../../../state/tilesets-store'
import { formatBytes } from '../../../data/logic/tileset-download'
import type { TilesetCatalogEntry } from '../../../data/models'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function CatalogRow({
  entry, downloaded, state, onDownload, onRemove,
}: {
  entry: TilesetCatalogEntry
  downloaded: TilesetMeta | null
  state: DownloadState
  onDownload: () => void
  onRemove: () => void
}) {
  const isDownloading = state.phase === 'downloading'
  const frac = isDownloading ? state.progress.fractionComplete : 0
  const received = isDownloading ? state.progress.receivedBytes : 0
  const totalKnown = isDownloading ? state.progress.totalBytes : 0

  return (
    <div style={{
      padding: '14px 16px', borderBottom: `1px solid ${theme.colors.darkBorder}`,
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: theme.size.body, fontWeight: 700, color: theme.colors.cream, marginBottom: '3px' }}>
            {entry.name}
          </div>
          <div style={{ fontSize: theme.size.small, color: theme.colors.dim, lineHeight: 1.4 }}>
            {entry.description}
          </div>
          <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.mono, marginTop: '4px' }}>
            {downloaded
              ? `${formatBytes(downloaded.sizeBytes)} · downloaded ${formatDate(downloaded.downloadedAt)}`
              : `~${formatBytes(entry.estimatedSizeBytes)} · zoom 0–${entry.maxZoom}`}
          </div>
        </div>

        {downloaded ? (
          <button
            onClick={onRemove}
            style={{
              padding: '8px 12px', borderRadius: '8px',
              border: `1px solid ${theme.colors.red}`,
              background: 'none', color: theme.colors.red,
              cursor: 'pointer', fontFamily: theme.font.primary,
              fontSize: theme.size.small, minHeight: theme.tapTarget, flexShrink: 0,
            }}
          >
            Remove
          </button>
        ) : (
          <button
            onClick={onDownload}
            disabled={isDownloading}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              border: `1px solid ${theme.colors.red}`,
              background: isDownloading ? 'none' : theme.colors.red,
              color: isDownloading ? theme.colors.dim : theme.colors.cream,
              cursor: isDownloading ? 'default' : 'pointer',
              fontFamily: theme.font.primary, fontWeight: 700,
              fontSize: theme.size.small, minHeight: theme.tapTarget, flexShrink: 0,
              opacity: isDownloading ? 0.6 : 1,
            }}
          >
            {isDownloading ? 'Downloading…' : 'Download'}
          </button>
        )}
      </div>

      {isDownloading && (
        <div>
          <div style={{
            height: '4px', background: theme.colors.darkBorder, borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.round(frac * 100)}%`,
              height: '100%', background: theme.colors.red,
              transition: 'width 120ms linear',
            }} />
          </div>
          <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.mono, marginTop: '4px' }}>
            {formatBytes(received)}
            {totalKnown > 0 ? ` / ${formatBytes(totalKnown)} · ${Math.round(frac * 100)}%` : ' · size unknown'}
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div style={{
          fontSize: theme.size.small, color: theme.colors.red,
          background: theme.colors.redDim, padding: '8px 10px', borderRadius: '6px',
        }}>
          {state.message}
        </div>
      )}
    </div>
  )
}

function ConfirmModal({
  title, message, confirmLabel, onCancel, onConfirm,
}: {
  title: string; message: string; confirmLabel: string
  onCancel: () => void; onConfirm: () => void
}) {
  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.colors.darkCard,
          border: `1px solid ${theme.colors.darkBorder}`,
          borderRadius: '16px', padding: '20px', width: '300px',
          fontFamily: theme.font.primary,
        }}
      >
        <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '8px' }}>{title}</div>
        <div style={{ fontSize: theme.size.small, color: theme.colors.light, marginBottom: '16px', lineHeight: 1.4 }}>{message}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px',
              border: `1px solid ${theme.colors.darkBorder}`, background: 'none',
              color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary,
              fontSize: theme.size.body, minHeight: theme.tapTarget,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px',
              border: `2px solid ${theme.colors.red}`, background: theme.colors.red,
              color: theme.colors.cream, cursor: 'pointer', fontWeight: 700,
              fontFamily: theme.font.primary, fontSize: theme.size.body, minHeight: theme.tapTarget,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function TilesetsPage() {
  const { catalog, downloaded, downloads, initialized, init, download, remove } = useTilesetsStore()
  const [confirmRemove, setConfirmRemove] = useState<TilesetMeta | null>(null)

  useEffect(() => { if (!initialized) init() }, [initialized, init])

  const totalBytes = downloaded.reduce((sum, d) => sum + d.sizeBytes, 0)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      <div style={{
        padding: '14px 16px 10px', borderBottom: `1px solid ${theme.colors.darkBorder}`,
      }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream }}>Offline Maps</div>
        <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginTop: '3px' }}>
          {downloaded.length === 0
            ? 'Download regions for map access without a cell signal.'
            : `${downloaded.length} region${downloaded.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)} stored`}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {catalog.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>◱</div>
            <div style={{ color: theme.colors.dim, fontSize: theme.size.body }}>No regions available.</div>
          </div>
        )}
        {catalog.map(entry => {
          const d = downloaded.find(x => x.id === entry.id) ?? null
          const state = downloads[entry.id] ?? { phase: 'idle' as const }
          return (
            <CatalogRow
              key={entry.id}
              entry={entry}
              downloaded={d}
              state={state}
              onDownload={() => download(entry.id)}
              onRemove={() => d && setConfirmRemove(d)}
            />
          )
        })}
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Remove offline region?"
          message={`This deletes ${formatBytes(confirmRemove.sizeBytes)} from device storage. You can re-download the region later.`}
          confirmLabel="Remove"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={async () => {
            const id = confirmRemove.id
            setConfirmRemove(null)
            await remove(id)
          }}
        />
      )}
    </div>
  )
}
