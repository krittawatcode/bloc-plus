import { ui } from '@/components/uiStyles';
import { useWalls } from '@/data/queries';
import { PRACTICE_WALL_ID } from '@/domain/types';
import { useStaffWall } from './staffWall';

export function WallSelect() {
  const { wallId, setWallId } = useStaffWall();
  const walls = useWalls().data ?? [];
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor="wallSelect">
        Wall
      </label>
      <select id="wallSelect" className={ui.input} value={wallId} onChange={(e) => setWallId(e.target.value)}>
        {walls.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
        <option value={PRACTICE_WALL_ID}>Practice wall</option>
      </select>
    </div>
  );
}
