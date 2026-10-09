import type { Provedor } from "./estado";
import type { Nuvem } from "./tipos";
import { onedrive } from "./microsoft";
import { googleDrive } from "./google";

export const NUVENS: Record<Provedor, Nuvem> = {
  MICROSOFT: onedrive,
  GOOGLE: googleDrive,
};

export * from "./estado";
export * from "./tipos";
