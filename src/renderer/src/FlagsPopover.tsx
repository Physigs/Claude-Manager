import { useState } from 'react'
import type { Project } from '../../main/projectList'
import { KNOWN_FLAGS, buildFlagString, parseFlagString } from '../../main/flags'

interface FlagsPopoverProps {
  project: Project
  flagHistory: string[]
  onSave: (path: string, flags: string) => void
  onClose: () => void
}

function FlagsPopover({ project, flagHistory, onSave, onClose }: FlagsPopoverProps): JSX.Element {
  const initial = parseFlagString(project.flags)
  const [checked, setChecked] = useState<Set<string>>(new Set(initial.checked))
  const [freeText, setFreeText] = useState(initial.freeText)

  function toggleFlag(flag: string): void {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(flag)) next.delete(flag)
      else next.add(flag)
      return next
    })
  }

  function applyHistoryEntry(entry: string): void {
    const parsed = parseFlagString(entry)
    setChecked(new Set(parsed.checked))
    setFreeText(parsed.freeText)
  }

  function handleSave(): void {
    onSave(project.path, buildFlagString([...checked], freeText))
    onClose()
  }

  return (
    <div className="flags-popover">
      <div className="flags-checklist">
        {KNOWN_FLAGS.map((flag) => (
          <label key={flag} className="flags-checkbox">
            <input type="checkbox" checked={checked.has(flag)} onChange={() => toggleFlag(flag)} />
            {flag}
          </label>
        ))}
      </div>
      <input
        className="flags-freetext"
        placeholder="Other flags, e.g. --model opus"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
      />
      {flagHistory.length > 0 && (
        <select
          className="flags-history"
          value=""
          onChange={(e) => e.target.value && applyHistoryEntry(e.target.value)}
        >
          <option value="">Reuse previous…</option>
          {flagHistory.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      )}
      <div className="flags-actions">
        <button onClick={handleSave}>Save</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export default FlagsPopover
