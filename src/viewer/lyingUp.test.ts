import { describe, expect, it } from 'vitest';
import { lyingUp } from './WallViewer';

describe('lyingUp', () => {
  it('leaves ordinary views turning around straight up', () => {
    expect(lyingUp({ pos: [5.4, 3.2, 0.4], target: [0, 1.5, 0] })).toBeNull();
    expect(lyingUp(null)).toBeNull();
  });

  it('turns a wall seen from straight above around the way that was up on screen', () => {
    // The live "16_11_2569 BE" view: camera 5.4 m above the target, a hair towards +z.
    const up = lyingUp({ pos: [0.1063, 6.3255, 0.0354], target: [0.1072, 0.9431, 0.0499] })!;
    expect(up).not.toBeNull();
    expect(up.y).toBeCloseTo(0, 5);
    expect(up.z).toBeGreaterThan(0.99);
  });

  it('flips the direction for a view from below', () => {
    const up = lyingUp({ pos: [0, -5, -0.01], target: [0, 0, 0] })!;
    expect(up.z).toBeLessThan(-0.99);
  });
});
