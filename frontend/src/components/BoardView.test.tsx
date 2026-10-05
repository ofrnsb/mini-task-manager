import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { task } from '../test/utils';
import { BoardView } from './BoardView';

describe('BoardView', () => {
  it('only accepts a drop on the next status column', () => {
    const onAdvance = vi.fn();
    const todo = task({ id: 1, title: 'A', status: 'to_do' });
    render(
      <BoardView
        tasks={[todo]}
        selectedId={null}
        busyId={null}
        flashIds={new Set()}
        onAdvance={onAdvance}
        onSelect={() => {}}
        onDelete={() => {}}
      />,
    );

    fireEvent.dragStart(screen.getByText('A').closest('li')!, { dataTransfer: { setData() {}, effectAllowed: '' } });

    const pending = screen.getByRole('region', { name: 'Pending' });
    const done = screen.getByRole('region', { name: 'Done' });
    expect(within(pending).getByText('Drop to move here')).toBeInTheDocument();
    expect(within(done).getByText('Not allowed')).toBeInTheDocument();

    fireEvent.drop(done);
    expect(onAdvance).not.toHaveBeenCalled();

    fireEvent.dragStart(screen.getByText('A').closest('li')!, { dataTransfer: { setData() {}, effectAllowed: '' } });
    fireEvent.drop(pending);
    expect(onAdvance).toHaveBeenCalledWith(todo);
  });

  it('does not let a done task be dragged', () => {
    render(
      <BoardView
        tasks={[task({ status: 'done' })]}
        selectedId={null}
        busyId={null}
        flashIds={new Set()}
        onAdvance={() => {}}
        onSelect={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText('Prepare Invoice').closest('li')).toHaveAttribute('draggable', 'false');
  });
});
