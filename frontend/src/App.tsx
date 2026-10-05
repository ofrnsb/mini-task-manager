import { useState } from 'react';
import { USERS, type Actor } from '@mtm/shared';
import { AppShell, type View } from './components/AppShell';
import { ActivityView } from './views/ActivityView';
import { TasksView } from './views/TasksView';

export function App() {
  const [actor, setActor] = useState<Actor>(USERS[0]);
  const [view, setView] = useState<View>('tasks');

  return (
    <AppShell actor={actor} onActorChange={setActor} view={view} onViewChange={setView}>
      {view === 'tasks' ? <TasksView actor={actor} /> : <ActivityView />}
    </AppShell>
  );
}
