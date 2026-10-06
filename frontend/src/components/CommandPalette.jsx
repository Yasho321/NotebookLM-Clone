import { Command } from 'cmdk';
import { Plus, MessageSquare, FileText, SunMoon } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useSourceStore } from '../stores/sourceStore';
import { useThemeStore } from '../stores/themeStore';

/**
 * Cmd/Ctrl+K command palette. Fuzzy-search across quick actions, dialogues, and sources.
 * cmdk handles filtering, keyboard navigation, and focus trapping for us.
 */
export default function CommandPalette({ open, onOpenChange }) {
  const { chats, selectChat, startNewChat } = useChatStore();
  const { sources, selectSource } = useSourceStore();
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const run = (fn) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command menu">
      <Command.Input placeholder="Type a command or search…" />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Actions">
          <Command.Item onSelect={() => run(startNewChat)}>
            <Plus className="w-3.5 h-3.5" /> New dialogue
          </Command.Item>
          <Command.Item onSelect={() => run(toggleTheme)}>
            <SunMoon className="w-3.5 h-3.5" /> Toggle theme
          </Command.Item>
        </Command.Group>

        {chats.length > 0 && (
          <Command.Group heading="Dialogues">
            {chats.slice(0, 8).map((c) => (
              <Command.Item
                key={c._id}
                value={`dialogue ${c.title || 'untitled'} ${c._id}`}
                onSelect={() => run(() => selectChat(c._id))}
              >
                <MessageSquare className="w-3.5 h-3.5" /> {c.title || 'Untitled Dialogue'}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {sources.length > 0 && (
          <Command.Group heading="Sources">
            {sources.slice(0, 8).map((s) => (
              <Command.Item
                key={s._id}
                value={`source ${s.title || s.originalFileName || ''} ${s._id}`}
                onSelect={() => run(() => selectSource(s))}
              >
                <FileText className="w-3.5 h-3.5" /> {s.title || s.originalFileName || 'Source'}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
