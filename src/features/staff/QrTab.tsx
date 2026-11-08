import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Link } from 'react-router-dom';
import { GradeBadge, Loading } from '@/components/ui';
import { ui } from '@/components/uiStyles';
import { useCoreData, useSaveSettings } from '@/data/queries';
import { useStageCollapsed, useStageScene } from '@/viewer/stageContext';
import { qrTarget, siteUrl } from './qr';
import { wallLabel } from './staffWall';
import s from './Staff.module.css';

/** One sticker per start hold. The codes never change, so extras can come and go without reprinting. */
export function QrTab() {
  const d = useCoreData();
  const saveSettings = useSaveSettings();
  const [link, setLink] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const base = link ?? d.settings?.qrLink ?? '';
  const routes = d.routes.filter((r) => r.type === 'base' && d.walls.some((w) => w.id === r.wallId));

  useStageScene(null, 'qr', 'QR codes go next to the start hold of each normal route.');
  useStageCollapsed();

  const routeIds = routes.map((r) => r.id).join(',');
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      const out: Record<string, string> = {};
      for (const id of routeIds.split(',').filter(Boolean)) {
        out[id] = await QRCode.toDataURL(qrTarget(base, id), {
          margin: 1,
          width: 320,
          errorCorrectionLevel: 'M',
        });
      }
      if (alive) setCodes(out);
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [routeIds, base]);

  if (d.isLoading || !d.settings) return <Loading />;
  return (
    <>
      <div className={s.noPrint}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="qlink">
            Link in the QR codes
          </label>
          <input
            id="qlink"
            className={ui.input}
            value={base || siteUrl()}
            onChange={(e) => setLink(e.target.value)}
            onBlur={() =>
              link !== null &&
              saveSettings.mutate({ ...d.settings!, qrLink: link.trim() === siteUrl() ? '' : link.trim() })
            }
          />
          <p className={`${ui.muted} ${ui.smallText}`}>
            Leave this as your site's address. Each code adds its start, like #/r/b123.
          </p>
        </div>
        <p className={ui.note}>
          One sticker per start hold. Codes never change, so you can add or archive extras without reprinting.
        </p>
        <div className={ui.actions}>
          <button
            type="button"
            className={`${ui.btn} ${ui.primary}`}
            onClick={() => window.print()}
            disabled={!routes.length}
          >
            Print QR sheet
          </button>
        </div>
      </div>
      <p className={s.printTitle}>{d.settings.gymName} · Extra routes</p>
      {routes.length ? (
        <div className={s.qrGrid}>
          {routes.map((r) => (
            <figure key={r.id} className={s.qr}>
              {codes[r.id] ? <img src={codes[r.id]} alt={`QR code for ${r.name}`} /> : <Loading text="" />}
              <figcaption>
                <strong>
                  <span className={ui.tapeInline} style={{ background: r.color ?? '#999' }} />
                  {r.name} <GradeBadge grading={d.settings?.grading} id={r.grade} />
                </strong>
                <span className={`${ui.muted} ${ui.smallText}`}>
                  {wallLabel(d.walls, r.wallId)} · Scan for extra routes
                </span>
                <Link to={`/r/${r.id}`} className={`${ui.link} ${s.noPrint}`}>
                  Open as climber
                </Link>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className={ui.empty}>
          No normal routes on your scanned walls yet. Practice wall routes don't get QR codes.
        </p>
      )}
    </>
  );
}
