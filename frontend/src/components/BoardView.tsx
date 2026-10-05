import { useState, type DragEvent } from 'react';
import { TASK_STATUSES, nextStatus, type Task, type TaskStatus } from '@mtm/shared';
import { Icon } from '../lib/icons';
import { STATUS_LABEL } from '../lib/status';
import { relativeTime } from '../lib/time';
import { StatusRing } from './StatusRing';

interface Props {
  tasks: Task[];
  selectedId: number | null;
  busyId: number | null | undefined;
  flashIds: ReadonlySet<number>;
  onAdvance: (task: Task) => void;
  onSelect: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/**
 * Kanban board. Dragging shows the status rule: only the next column accepts
 * the card; the others are marked "not allowed". The API enforces the same rule.
 */
export function BoardView({ tasks, selectedId, busyId, flashIds, onAdvance, onSelect, onDelete }: Props) {
  const [dragging, setDragging] = useState<Task | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  const target = dragging ? nextStatus(dragging.status) : null;

  function drop(e: DragEvent, column: TaskStatus) {
    e.preventDefault();
    if (dragging && column === target) onAdvance(dragging);
    setDragging(null);
    setOver(null);
  }

  return (
    <div className={`board ${dragging ? 'is-dragging' : ''}`}>
      {TASK_STATUSES.map((column) => {
        const cards = tasks.filter((t) => t.status === column);
        const allowed = column === target;
        const isSource = dragging?.status === column;
        return (
          <section
            key={column}
            className={`column ${column} ${dragging && !isSource ? (allowed ? 'drop-ok' : 'drop-no') : ''} ${
              over === column ? 'over' : ''
            }`}
            aria-label={STATUS_LABEL[column]}
            onDragOver={(e) => {
              if (allowed) e.preventDefault(); // only the next column is a valid drop target
              setOver(column);
            }}
            onDragLeave={() => setOver((o) => (o === column ? null : o))}
            onDrop={(e) => drop(e, column)}
          >
            <header className="column-head">
              <span className={`pill ${column}`}>{STATUS_LABEL[column]}</span>
              <span className="column-count">{cards.length}</span>
            </header>

            {dragging && !isSource && (
              <div className="drop-hint">
                {allowed ? (
                  <>
                    <Icon.arrowRight /> Drop to move here
                  </>
                ) : (
                  <>
                    <Icon.ban /> Not allowed
                  </>
                )}
              </div>
            )}

            <ul className="cards">
              {cards.map((task) => {
                const next = nextStatus(task.status);
                return (
                  <li
                    key={task.id}
                    className={`board-card ${task.id === selectedId ? 'selected' : ''} ${
                      flashIds.has(task.id) ? 'flash' : ''
                    } ${dragging?.id === task.id ? 'dragging' : ''}`}
                    draggable={next !== null && task.id !== busyId}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(task.id));
                      setDragging(task);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  >
                    <button className="board-card-main" onClick={() => onSelect(task)}>
                      <StatusRing status={task.status} size={22} />
                      <span className="task-text">
                        <span className="task-title">{task.title}</span>
                        {task.description && <span className="task-desc">{task.description}</span>}
                      </span>
                    </button>
                    <div className="board-card-foot">
                      <span className="muted small" title={task.updatedAt}>
                        {relativeTime(task.updatedAt)}
                      </span>
                      <span className="board-card-actions">
                        {next && (
                          <button
                            className="btn btn-gray btn-sm"
                            onClick={() => onAdvance(task)}
                            disabled={task.id === busyId}
                          >
                            {STATUS_LABEL[next]} <Icon.arrowRight />
                          </button>
                        )}
                        <button className="icon-btn sm danger" onClick={() => onDelete(task)} aria-label="Delete task">
                          <Icon.trash />
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
              {cards.length === 0 && !dragging && <li className="column-empty">Nothing here</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
