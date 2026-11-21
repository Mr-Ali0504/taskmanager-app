import type { AccountRow } from '../db/schema';
import { demo } from './demo';
import { facebook } from './facebook';
import { instagram } from './instagram';
import type { PlatformAdapter } from './types';
import { youtube } from './youtube';

const real = { youtube, instagram, facebook } as Record<string, PlatformAdapter<any>>;

/** Demo accounts get the demo adapter; everything else talks to the real platform. */
export const adapterFor = (account: AccountRow): PlatformAdapter<any> => (account.demo ? demo : real[account.platform]);
export { PlatformError } from './types';
