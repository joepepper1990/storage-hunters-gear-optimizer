import type { AppData, AlgorithmSettings } from '../types';
// Explicit pre-November policy fixtures for historical algorithm regressions.
// New requirements are tested against the real defaults in auctionUpdate.test.ts.
export * from '../defaults';
import { makeInitialData as currentData, makeEmptyData as currentEmpty, LOCKED_DEFAULT_SETTINGS as currentSettings } from '../defaults';
import { makeCurrentGear } from './legacyInventory';
import { screenshotTrophies } from '../data/screenshotEquipment';
export const LOCKED_DEFAULT_SETTINGS:AlgorithmSettings={...currentSettings,goalMode:undefined,arrowPolicy:undefined,arrowWeight:1,arrowTargetMin:70,arrowTargetMax:90,energyWeight:.3,zoneWeight:.6,recoveryWeight:.2,goldenHourLuck:0};
export function makeInitialData():AppData{const data=currentData();return {...data,gear:makeCurrentGear(),trophies:screenshotTrophies(),settings:{...LOCKED_DEFAULT_SETTINGS}};}

export function makeEmptyData():AppData{return {...currentEmpty(),settings:{...LOCKED_DEFAULT_SETTINGS}};}
