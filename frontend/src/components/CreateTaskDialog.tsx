import { useState, type FormEvent } from 'react';
import { DESCRIPTION_MAX, TITLE_MAX } from '@mtm/shared';
import { useCreateTask } from '../api/hooks';
import { Dialog } from './Dialog';

/** iOS-style sheet: Cancel on the left, the title in the middle, the confirming action on the right. */
export function CreateTaskDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateTask();

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ title, description }, { onSuccess: onClose });
  }

  return (
    <Dialog onClose={onClose} className="sheet" labelledBy="new-task-title">
      <form onSubmit={submit}>
        <header className="sheet-nav">
          <button type="button" className="btn-plain" onClick={onClose}>
            Cancel
          </button>
          <h2 id="new-task-title">New Task</h2>
          <button type="submit" className="btn-plain strong" disabled={!title.trim() || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add'}
          </button>
        </header>

        <div className="form-group">
          <input
            data-autofocus
            aria-label="Title"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
          />
          <textarea
            aria-label="Description"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={4}
          />
        </div>
        <p className="form-footnote">New tasks start in To do and move one step at a time.</p>
        {create.error && <p className="alert">{create.error.message}</p>}
      </form>
    </Dialog>
  );
}
