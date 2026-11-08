import { useState } from 'react';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useCoreData, useSaveSettings } from '@/data/queries';
import { cleanTag, tagOptions } from '@/domain/routes';
import s from './Staff.module.css';

/**
 * Tags on a route. Tap a tag to add or remove it. A new tag is put on this route and added to the
 * gym's tag list, so it can be picked for other routes too.
 */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const data = useCoreData();
  const saveSettings = useSaveSettings();
  const toast = useToast();
  const [text, setText] = useState('');
  const gymTags = data.settings?.tags ?? [];
  const options = tagOptions(gymTags, value);

  const add = () => {
    const tag = cleanTag(text);
    if (!tag) return;
    const known = options.find((t) => t.toLowerCase() === tag.toLowerCase());
    const name = known ?? tag;
    if (!value.includes(name)) onChange([...value, name]);
    setText('');
    if (!known && data.settings)
      saveSettings.mutate(
        { ...data.settings, tags: [...gymTags, name] },
        {
          onSuccess: () => toast(`"${name}" added to the gym's tags.`),
          onError: (e) => toast(friendly(e)),
        },
      );
  };

  return (
    <div className={ui.field}>
      <span className={ui.label}>Tags</span>
      <div className={ui.chips}>
        {options.map((t) => (
          <button
            key={t}
            type="button"
            className={ui.chip}
            aria-pressed={value.includes(t)}
            onClick={() => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])}
          >
            {t}
          </button>
        ))}
      </div>
      <form
        className={s.tagAdd}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className={ui.input}
          value={text}
          maxLength={30}
          placeholder="New tag, like Crimpy"
          aria-label="New tag"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className={`${ui.btn} ${ui.small}`} disabled={!cleanTag(text)}>
          Add
        </button>
      </form>
    </div>
  );
}

/** The gym's tag list in Gym settings. Removing a tag here leaves it on routes that already have it. */
export function GymTags({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const tag = cleanTag(text);
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...tags, tag]);
    setText('');
  };
  return (
    <div className={ui.field}>
      <span className={ui.label}>Route tags</span>
      <div className={ui.chips}>
        {tags.map((t) => (
          <span key={t} className={ui.chip}>
            {t}
            <button
              type="button"
              className={s.tagRemove}
              aria-label={`Remove tag ${t}`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        className={s.tagAdd}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className={ui.input}
          value={text}
          maxLength={30}
          placeholder="New tag, like Crimpy"
          aria-label="New tag"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className={`${ui.btn} ${ui.small}`} disabled={!cleanTag(text)}>
          Add
        </button>
      </form>
      <p className={`${ui.muted} ${ui.smallText}`}>
        Staff pick these when setting a route, and climbers see them on the route. Removing a tag here keeps
        it on routes that already have it. &quot;Marked feet only&quot; is always offered.
      </p>
    </div>
  );
}
