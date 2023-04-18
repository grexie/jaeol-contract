import BN from 'bn.js';

export interface BondHead {
  exists: boolean;
  bond: BN;
}

export interface BondNext {
  exists: boolean;
  bond: BN;
}
