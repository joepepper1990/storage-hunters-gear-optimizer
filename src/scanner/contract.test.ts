import { describe, expect, it } from 'vitest';
import { SCANNER_CONTRACT } from './contract';

describe('local gear scanner contract', () => {
  it('keeps screenshots local and requires review before save', () => {
    expect(SCANNER_CONTRACT.localOnly).toBe(true);
    expect(SCANNER_CONTRACT.reviewBeforeSave).toBe(true);
    expect(SCANNER_CONTRACT.visualLineAuthentication).toBe(true);
    expect(SCANNER_CONTRACT.lazyOcrEngine).toBe(true);
  });
});
