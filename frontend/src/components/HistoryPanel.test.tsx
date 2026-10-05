import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, log, mockFetch, renderWithQuery, task } from '../test/utils';
import { HistoryPanel } from './HistoryPanel';

describe('HistoryPanel', () => {
  it('shows the selected task even when an earlier request answers last', async () => {
    let releaseA!: () => void;
    const aAnswered = new Promise<void>((r) => (releaseA = r));
    mockFetch(async (url) => {
      if (url === '/api/tasks/1/audit-logs') {
        await aAnswered; // A is slow
        return json([log({ taskId: 1, taskTitle: 'A' })]);
      }
      return json([log({ id: 2, taskId: 2, taskTitle: 'B', actor: 'jane.smith' })]);
    });

    const { rerender } = renderWithQuery(<HistoryPanel task={task({ id: 1, title: 'A' })} onClose={() => {}} />);
    rerender(<HistoryPanel task={task({ id: 2, title: 'B' })} onClose={() => {}} />);
    expect(await screen.findByText(/User "jane.smith" changed Task "B"/)).toBeInTheDocument();

    releaseA();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/changed Task "A"/)).not.toBeInTheDocument();
  });
});
