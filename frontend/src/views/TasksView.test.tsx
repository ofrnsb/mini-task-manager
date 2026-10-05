import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, log, mockFetch, renderWithQuery, task } from '../test/utils';
import { TasksView } from './TasksView';

describe('TasksView', () => {
  it('moves a task to its next status', async () => {
    let current = task();
    mockFetch((url, init) => {
      if (url === '/api/tasks') return json([current]);
      if (init.method === 'PUT') {
        current = task({ status: 'pending' });
        return json({ task: current, changed: true, lastChange: log() });
      }
      return json([]);
    });
    renderWithQuery(<TasksView actor="john.doe" />);

    await userEvent.click(await screen.findByRole('button', { name: /Move to Pending/ }));

    expect(await screen.findByRole('button', { name: /Move to In progress/ })).toBeInTheDocument();
  });

  it('explains a stale click and resyncs the row', async () => {
    mockFetch((url, init) => {
      if (url === '/api/tasks') return json([task()]);
      if (init.method === 'PUT') {
        return json(
          {
            error: {
              code: 'STALE_STATUS',
              message: 'Task is now "in_progress"',
              details: {
                task: task({ status: 'in_progress' }),
                lastChange: log({ actor: 'jane.smith', fromStatus: 'pending', toStatus: 'in_progress' }),
              },
            },
          },
          409,
        );
      }
      return json([]);
    });
    renderWithQuery(<TasksView actor="john.doe" />);

    await userEvent.click(await screen.findByRole('button', { name: /Move to Pending/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'jane.smith moved "Prepare Invoice" to In progress before you',
    );
    const row = screen.getByText('Prepare Invoice').closest('li')!;
    expect(within(row).getByRole('button', { name: /Move to Done/ })).toBeInTheDocument();
  });

  it('does not offer a next step for a done task', async () => {
    mockFetch(() => json([task({ status: 'done' })]));
    renderWithQuery(<TasksView actor="john.doe" />);
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move to/ })).not.toBeInTheDocument();
  });
});
