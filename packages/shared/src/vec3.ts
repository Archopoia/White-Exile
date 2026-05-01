/**
 * Compact 3D vector wire schema. Lifted out of protocol.ts so other shared
 * modules (world.ts) can import it without forming a cycle.
 */
import { z } from 'zod';

export const Vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export type Vec3 = z.infer<typeof Vec3Schema>;
