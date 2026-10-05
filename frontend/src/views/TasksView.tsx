import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StaleStatusDetailsSchema, nextStatus, type Actor, type Task, type TaskStatus } from '@mtm/shared';
import { ApiRequestError } from '../api/client';
import { queryKeys, useChangeStatus, useDeleteTask, useTasks } from '../api/hooks';
import { BoardView } from '../components/BoardView';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CreateTaskDialog } from '../components/CreateTaskDialog';
import { FlowSummary } from '../components/FlowSummary';
import { HistoryPanel } from '../components/HistoryPanel';
import { TaskRow } from '../components/TaskRow';
import { useToast } from '../components/Toaster';
import { Icon } from '../lib/icons';
import { STATUS_LABEL } from '../lib/status';

type Filter = 'all' | TaskStatus;
type Layout = 'list' | 'board';
const LAYOUT_KEY = 'mtm-layout';

/** Turns a failed status change into a sentence a user can act on. */
function describeError(err: Error, task: Task): string {
  if (err instanceof ApiRequestError && err.code === 'STALE_STATUS') {
    const details = StaleStatusDetailsSchema.safeParse(err.details);
    if (details.success) {
      const who = details.data.lastChange?.actor ?? 'Someone';
      return `${who} moved "${task.title}" to ${STATUS_LABEL[details.data.task.status]} before you. The list is updated.`;
    }
  }
  return err.message;
}

function savedLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

/** Highlights tasks whose updatedAt changed since the last fetch (a teammate's change, or ours). */
function useChangedTaskIds(): ReadonlySet<number> {
  const qc = useQueryClient();
  const [ids, setIds] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    let previous = new Map((qc.getQueryData<Task[]>(queryKeys.tasks) ?? []).map((t) => [t.id, t.updatedAt]));
    return qc.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.query.queryKey[0] !== queryKeys.tasks[0]) return;
      const tasks = (event.query.state.data as Task[] | undefined) ?? [];
      const changed = tasks.filter(
        (t) => previous.size > 0 && previous.has(t.id) && previous.get(t.id) !== t.updatedAt,
      );
      previous = new Map(tasks.map((t) => [t.id, t.updatedAt]));
      if (changed.length === 0) return;
      setIds(new Set(changed.map((t) => t.id)));
      setTimeout(() => setIds(new Set()), 2400);
    });
  }, [qc]);

  return ids;
}

export function TasksView({ actor }: { actor: Actor }) {
  const { data: tasks = [], error: loadError, isPending } = useTasks();
  const changeStatus = useChangeStatus(actor);
  const deleteTask = useDeleteTask();
  const toast = useToast();
  const flashIds = useChangedTaskIds();

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<Layout>(savedLayout);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Shortcuts: N opens the new-task dialog, / focuses search. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, dialog')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setCreating(true);
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function switchLayout(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Not persisted; the switch still applies for this visit.
    }
  }

  const q = query.trim().toLowerCase();
  const matching = q
    ? tasks.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    : tasks;
  const visible = filter === 'all' ? matching : matching.filter((t) => t.status === filter);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const openCount = tasks.length - doneCount;

  function advance(task: Task) {
    const to = nextStatus(task.status);
    if (!to) return;
    changeStatus.mutate(
      { task, to },
      {
        onSuccess: (res) => {
          if (res.changed) toast('success', `"${task.title}" moved to ${STATUS_LABEL[res.task.status]}`);
          else if (res.lastChange && res.lastChange.actor !== actor) {
            toast('info', `${res.lastChange.actor} already moved "${task.title}" to ${STATUS_LABEL[res.task.status]}.`);
          }
        },
        onError: (err) => toast('error', describeError(err, task)),
      },
    );
  }

  function remove(task: Task) {
    setConfirmDelete(null);
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        if (selectedId === task.id) setSelectedId(null);
        toast('success', `"${task.title}" deleted. Its history is kept.`);
      },
      onError: (err) => toast('error', err.message),
    });
  }

  const busyId = changeStatus.isPending
    ? changeStatus.variables?.task.id
    : deleteTask.isPending
      ? deleteTask.variables
      : null;

  const handlers = {
    onAdvance: advance,
    onSelect: (t: Task) => setSelectedId(t.id),
    onDelete: (t: Task) => setConfirmDelete(t),
  };

  return (
    <>
      <main className="main">
        <header className="page-head">
          <div>
            <h1>Tasks</h1>
            <p className="subtitle">
              {openCount} open · {doneCount} of {tasks.length} done
            </p>
          </div>
          <button className="btn btn-filled" onClick={() => setCreating(true)} title="New task (N)">
            <Icon.plus /> New Task
          </button>
        </header>

        {loadError && (
          <div className="alert" role="alert">
            {loadError.message}
          </div>
        )}

        <FlowSummary
          tasks={tasks}
          active={filter}
          onSelect={(f) => {
            setFilter(f);
            if (f !== 'all') switchLayout('list');
          }}
        />

        <section className="card tasks-card">
          <div className="toolbar">
            <label className="search">
              <Icon.search />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search tasks"
              />
              {!query && <kbd>/</kbd>}
            </label>

            {filter !== 'all' && layout === 'list' && (
              <button className="chip" onClick={() => setFilter('all')}>
                {STATUS_LABEL[filter]} <Icon.close />
              </button>
            )}

            <div className="segmented" role="group" aria-label="Layout">
              <button
                className={layout === 'list' ? 'active' : ''}
                aria-pressed={layout === 'list'}
                onClick={() => switchLayout('list')}
              >
                <Icon.rows /> List
              </button>
              <button
                className={layout === 'board' ? 'active' : ''}
                aria-pressed={layout === 'board'}
                onClick={() => switchLayout('board')}
              >
                <Icon.board /> Board
              </button>
            </div>
          </div>

          {isPending ? (
            <div className="skeleton-list" aria-label="Loading tasks">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton-row" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div className="empty">
              <span className="empty-icon">
                <Icon.tray />
              </span>
              <h2>No Tasks</h2>
              <p>Create a task, then move it through To do, Pending, In progress and Done.</p>
              <button className="btn btn-filled" onClick={() => setCreating(true)}>
                <Icon.plus /> New Task
              </button>
            </div>
          ) : layout === 'board' ? (
            <BoardView tasks={matching} selectedId={selectedId} busyId={busyId} flashIds={flashIds} {...handlers} />
          ) : visible.length === 0 ? (
            <div className="empty">
              <span className="empty-icon">
                <Icon.search />
              </span>
              <h2>No Results</h2>
              <p>
                No tasks match{q ? ` "${query.trim()}"` : ''}
                {filter !== 'all' ? ` in ${STATUS_LABEL[filter]}` : ''}.
              </p>
            </div>
          ) : (
            <ul className="task-list">
              <li className="list-head" aria-hidden="true">
                <span>Task</span>
                <span>Status</span>
                <span>Updated</span>
                <span />
              </li>
              {visible.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={task.id === selectedId}
                  busy={task.id === busyId}
                  flash={flashIds.has(task.id)}
                  onAdvance={() => handlers.onAdvance(task)}
                  onSelect={() => handlers.onSelect(task)}
                  onDelete={() => handlers.onDelete(task)}
                />
              ))}
            </ul>
          )}
        </section>
      </main>

      <HistoryPanel task={selected} onClose={() => setSelectedId(null)} />

      {creating && <CreateTaskDialog onClose={() => setCreating(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.title}"?`}
          body="The task disappears from the list. Its audit log is kept and stays in Activity."
          confirmLabel="Delete task"
          onConfirm={() => remove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
