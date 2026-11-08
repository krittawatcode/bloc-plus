import { createContext, useContext } from 'react';
import { PRACTICE_WALL_ID } from '@/domain/types';

/** The wall staff are working on, shared by the Routes and Walls tabs and remembered on this phone. */
export const StaffWallContext = createContext<{ wallId: string; setWallId: (id: string) => void }>({
  wallId: PRACTICE_WALL_ID,
  setWallId: () => {},
});
export const useStaffWall = () => useContext(StaffWallContext);

export const wallLabel = (walls: { id: string; name: string }[], id: string) =>
  id === PRACTICE_WALL_ID ? 'Demo wall' : (walls.find((w) => w.id === id)?.name ?? 'Wall');
