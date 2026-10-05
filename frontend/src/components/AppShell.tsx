import type { ReactNode } from 'react';
import { USERS, type Actor } from '@mtm/shared';
import { Icon } from '../lib/icons';
import { useTheme, type Theme } from '../lib/theme';
import { Avatar } from './Avatar';

export type View = 'tasks' | 'activity';

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Icon.check />
      </span>
      Mini Task
    </div>
  );
}

function ActorSelect({ actor, onChange }: { actor: Actor; onChange: (a: Actor) => void }) {
  return (
    <label className="field-stack">
      <span className="section-label">Acting as</span>
      <span className="popup">
        <Avatar name={actor} size={22} />
        <select value={actor} onChange={(e) => onChange(e.target.value as Actor)}>
          {USERS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </span>
    </label>
  );
}

const THEMES: { value: Theme; label: string; icon: () => ReactNode }[] = [
  { value: 'system', label: 'Auto', icon: Icon.auto },
  { value: 'light', label: 'Light', icon: Icon.sun },
  { value: 'dark', label: 'Dark', icon: Icon.moon },
];

function AppearancePicker({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <div className="field-stack">
      <span className="section-label" id="appearance-label">
        Appearance
      </span>
      <div className="segmented full" role="radiogroup" aria-labelledby="appearance-label">
        {THEMES.map(({ value, label, icon: ThemeIcon }) => (
          <button
            key={value}
            role="radio"
            aria-checked={theme === value}
            className={theme === value ? 'active' : ''}
            onClick={() => onChange(value)}
          >
            <ThemeIcon /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NavItems({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const item = (v: View, label: string, icon: ReactNode) => (
    <button
      className={`nav-item ${view === v ? 'active' : ''}`}
      aria-current={view === v ? 'page' : undefined}
      onClick={() => onChange(v)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <>
      {item('tasks', 'Tasks', <Icon.list />)}
      {item('activity', 'Activity', <Icon.activity />)}
    </>
  );
}

interface Props {
  actor: Actor;
  onActorChange: (a: Actor) => void;
  view: View;
  onViewChange: (v: View) => void;
  children: ReactNode;
}

/** Translucent sidebar on desktop; a top bar and a tab bar on phones (see styles.css). */
export function AppShell({ actor, onActorChange, view, onViewChange, children }: Props) {
  const { theme, resolved, setTheme } = useTheme();
  const flip = resolved === 'dark' ? 'light' : 'dark';

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Main">
          <NavItems view={view} onChange={onViewChange} />
        </nav>
        <div className="sidebar-foot">
          <AppearancePicker theme={theme} onChange={setTheme} />
          <ActorSelect actor={actor} onChange={onActorChange} />
        </div>
      </aside>

      <header className="mobile-header">
        <Brand />
        <div className="mobile-header-right">
          <button className="icon-btn" onClick={() => setTheme(flip)} aria-label={`Switch to ${flip} appearance`}>
            {resolved === 'dark' ? <Icon.sun /> : <Icon.moon />}
          </button>
          <ActorSelect actor={actor} onChange={onActorChange} />
        </div>
      </header>

      <nav className="tab-bar" aria-label="Main">
        <NavItems view={view} onChange={onViewChange} />
      </nav>

      {children}
    </div>
  );
}
