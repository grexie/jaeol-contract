import BN from 'bn.js';

export interface Config {
  usdt: string;
  depositAccount: string;
  transferFee100: BN;
  minDeposit: BN;
  minWithdraw: BN;
  baseURI: string;
  supplyCap: BN;
  earlyMaturation: BN;
  maxAffiliateMultipliers: BN;
  minAffiliateBondAmount100: BN;
  affiliateMultiplier100: BN;
}

export interface BondUI {
  visible: boolean;
  style: string;
  color: string[];
  name: string;
  description: string;
}

export interface BondType {
  id: BN;
  enabled: boolean;
  amount: BN;
  multiplier100: BN;
  matureDuration: BN;
  ui: BondUI;
}

export interface Bond {
  id: BN;
  token: BN;
  bondType: BN;
  owner: string;
  balance: BN;
  matures: BN;
  multiplier100: BN;
  affiliateMultipliers: BN;
}

export interface BondTokenPtr {
  owner: string;
  bond: BN;
}

export interface BondForgeRequirement {
  bondType: BN;
  count: BN;
  balance: BN;
  multiplier100: BN;
}

export interface BondForgeResult {
  bondType: BN;
  multiplier100: BN;
  matureDuration: BN;
}

export interface BondForge {
  id: BN;
  enabled: boolean;
  requirements: BondForgeRequirement[];
  result: BondForgeResult;
  name: string;
  description: string;
}

export interface BondAffiliate {
  account: string;
  bond: BN;
}
