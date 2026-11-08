import { useEffect, useState, type FormEvent } from 'react';
import { ui } from '@/components/uiStyles';
import { useToast } from '@/components/toastContext';
import { friendly } from '@/data/backend';
import { useAddComment } from '@/data/queries';
import type { Comment } from '@/domain/types';
import { device } from '@/lib/device';
import { shrinkPhoto } from '@/lib/image';
import { CommentItem } from './CommentItem';
import s from './RoutePage.module.css';

export function Comments({ routeId, comments }: { routeId: string; comments: Comment[] }) {
  const add = useAddComment();
  const toast = useToast();
  const [nick, setNick] = useState(device.get().nick);
  const [body, setBody] = useState('');
  const [beta, setBeta] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = nick.trim(),
      text = body.trim();
    if (!n) return toast('Add a nickname first.');
    if (!text && !photo) return toast('Write something or add a photo.');
    device.set({ nick: n });
    add.mutate(
      { routeId, nick: n, body: text, beta, photo },
      {
        onSuccess: () => {
          setBody('');
          setBeta(false);
          setPhoto(null);
          toast('Comment posted.');
        },
        onError: (err) => toast(friendly(err)),
      },
    );
  };

  return (
    <section className={s.comments} aria-label="Comments">
      <h3>
        Comments <span className={ui.muted}>{comments.length}</span>
      </h3>
      <form className={s.form} onSubmit={submit}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="cnick">
            Nickname
          </label>
          <input
            id="cnick"
            className={ui.input}
            maxLength={24}
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="What should people call you?"
          />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="ctext">
            Comment
          </label>
          <textarea
            id="ctext"
            className={ui.input}
            rows={3}
            maxLength={500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Beta, a send, or a question for the setter"
          />
        </div>
        <div className={ui.frow}>
          <label className={ui.check}>
            <input type="checkbox" id="cbeta" checked={beta} onChange={(e) => setBeta(e.target.checked)} />{' '}
            Beta, hide as spoiler
          </label>
          <span className={`${ui.btn} ${ui.small} ${s.photoButton}`}>
            Add photo
            <input
              type="file"
              id="cphoto"
              accept="image/*"
              aria-label="Add photo"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  setPhoto(await shrinkPhoto(f));
                } catch {
                  toast('That photo could not be opened.');
                }
              }}
            />
          </span>
        </div>
        {preview && (
          <div className={ui.frow}>
            <img src={preview} alt="Photo to attach" className={s.photo} />
            <button type="button" className={`${ui.link} ${ui.danger}`} onClick={() => setPhoto(null)}>
              Remove photo
            </button>
          </div>
        )}
        <button type="submit" className={`${ui.btn} ${ui.primary}`} disabled={add.isPending}>
          {add.isPending ? 'Posting…' : 'Post comment'}
        </button>
      </form>
      {comments.length ? (
        comments.map((c) => <CommentItem key={c.id} comment={c} />)
      ) : (
        <p className={ui.muted}>No comments yet. Be the first to share how it went.</p>
      )}
    </section>
  );
}
