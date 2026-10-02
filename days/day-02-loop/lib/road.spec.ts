import { describe, expect, it } from 'vitest';
import { BRIDGE_MARGIN, bridgeSpan, isOnBridge } from './road';

const length = 2000;
const bridge = { center: 700, flat: 45, ramp: 95 };

describe('isOnBridge', () => {
  const [from, to] = bridgeSpan(bridge);

  it('est vrai sur toute la portée du pont', () => {
    for (const d of [from, bridge.center, to]) expect(isOnBridge(bridge, length, d)).toBe(true);
  });

  it('passe au-dessus du pont avant la rampe et après, pour que le nez et la queue ne soient pas coupés', () => {
    expect(isOnBridge(bridge, length, from - BRIDGE_MARGIN + 1)).toBe(true);
    expect(isOnBridge(bridge, length, to + BRIDGE_MARGIN - 1)).toBe(true);
  });

  it('est faux loin du pont, tours compris', () => {
    expect(isOnBridge(bridge, length, from - BRIDGE_MARGIN - 1)).toBe(false);
    expect(isOnBridge(bridge, length, to + BRIDGE_MARGIN + 1)).toBe(false);
    expect(isOnBridge(bridge, length, 3 * length + bridge.center)).toBe(true);
    expect(isOnBridge(bridge, length, 3 * length + 1500)).toBe(false);
  });
});
