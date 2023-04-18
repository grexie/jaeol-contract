/// <reference types="../../types/truffle-contracts/types.d.ts" />

import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import type {
  BondTokenContract,
  BondTokenInstance,
  TokenContract,
  TokenInstance,
} from "../../types/truffle-contracts";
import type Web3 from "web3";
import * as ethUtil from "ethereumjs-util";
import { eventEmitted } from "truffle-assertions";
import { Bond, BondType, BondHead, BondNext } from "../types/index";

const COINS = Array.from({ length: 15 }, (_, i) => ({
  id: `token-${i}`,
  value: (10 * 10 ** (i / 2)) | 0,
  color: ["black"],
  name: `token-${i}`,
  description: `Token ${i} description`,
  multiplier: 400 + i * 10,
  style: "token-1",
  matureDuration: 365 * 24 * 3600,
}));

type Account = ReturnType<(typeof web3)["eth"]["accounts"]["create"]>;

chai.use(chaiAsPromised);
chai.should();

const BondToken = artifacts.require("BondToken");
const ERC20Token = artifacts.require("Token");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT256 =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n;
const DECIMALS = 18n;

contract("BondToken", ([deployer, wisdom, user1, user2, user3]) => {
  let contract: BondTokenInstance & { address: string };
  let erc20: TokenInstance & { address: string };

  const iterateBonds = async function* (account: string) {
    var { exists, bond } = (await contract.bondHead(account)) as BondHead;

    while (exists) {
      yield (await contract.bonds(account, bond)) as any as Bond;

      var { exists, bond } = (await contract.bondNext(
        account,
        bond
      )) as BondNext;
    }
  };

  beforeEach(async () => {
    erc20 = (await ERC20Token.new("Test USDT", "USDT", {
      from: deployer,
    })) as any;
    const decimals = BigInt((await erc20.decimals()).toString());

    await erc20.mint((400_000_000n * 10n ** decimals).toString(), {
      from: user1,
    });
    await erc20.mint((400_000_000n * 10n ** decimals).toString(), {
      from: user2,
    });
    await erc20.mint((400_000_000n * 10n ** decimals).toString(), {
      from: user3,
    });

    contract = (await BondToken.new(
      "Wisdom and Love Bond",
      "BOND",
      {
        usdt: erc20.address,
        depositAccount: wisdom,
        transferFee100: 1000n.toString(),
        minDeposit: (10n * 10n ** decimals).toString(),
        minWithdraw: (40n * 10n ** decimals).toString(),
        baseURI: "http://localhost:3000/bonds/",
        supplyCap: (400_000_000n * 10n ** decimals).toString(),
        earlyMaturation: 0n.toString(),
        affiliateMultiplier100: 5n.toString(),
        maxAffiliateMultipliers: 10n.toString(),
        minAffiliateBondAmount100: 50n.toString(),
      },
      { from: deployer }
    )) as any;
  });

  describe("ERC20 basic properties", () => {
    it("should have symbol BOND", async () => {
      const symbol = await contract.symbol();
      symbol.toString().should.equal("BOND");
    });

    it("should be named 'Wisdom and Love Bond'", async () => {
      const name = await contract.name();
      name.toString().should.equal("Wisdom and Love Bond");
    });

    it(`should have ${DECIMALS} decimal places`, async () => {
      const decimals = await contract.decimals();
      decimals.toString().should.equal(DECIMALS.toString());
    });

    it("should have 0 total supply", async () => {
      const totalSupply = await contract.totalSupply();
      totalSupply.toString().should.equal(0n.toString());
    });
  });

  describe("Bond enumeration", () => {
    it("should add bond types", async () => {
      const bond1 = await contract.addBondType(
        {
          id: 0n.toString(),
          enabled: true,
          amount: (10n * 10n ** DECIMALS).toString(),
          multiplier100: 4n.toString(),
          matureDuration: (4n * 365n * 24n * 3600n).toString(),
          ui: {
            style: "coin-1",
            color: ["black", "white"],
            description: "Bond 1",
            name: "Bond 1",
            visible: true,
          },
        },
        { from: deployer }
      );
      const bond2 = await contract.addBondType(
        {
          id: 0n.toString(),
          enabled: false,
          amount: (25n * 10n ** DECIMALS).toString(),
          multiplier100: 4n.toString(),
          matureDuration: (4n * 365n * 24n * 3600n).toString(),
          ui: {
            style: "coin-1",
            color: ["yellow", "white"],
            description: "Bond 2",
            name: "Bond 2",
            visible: true,
          },
        },

        { from: deployer }
      );
      const bond3 = await contract.addBondType(
        {
          id: 0n.toString(),
          enabled: true,
          amount: (50n * 10n ** DECIMALS).toString(),
          multiplier100: 4n.toString(),
          matureDuration: (4n * 365n * 24n * 3600n).toString(),
          ui: {
            style: "coin-1",
            color: ["pink", "white"],
            description: "Bond 3",
            name: "Bond 3",
            visible: true,
          },
        },
        { from: deployer }
      );

      // eventEmitted(bond1, 'TestEvent', (args: any) => {
      //   return args[0] === 10n && args.secondParamName === args[2];
      // });

      // bond1.toString().should.not.equal(bond2.toString());
      // bond2.toString().should.not.equal(bond3.toString());

      const bond1Info = (await contract.bondTypes(
        0n.toString()
      )) as any as BondType;
      bond1Info.id.toString().should.equal(0n.toString());
      bond1Info.enabled.should.be.true;

      const bond2Info = (await contract.bondTypes(
        1n.toString()
      )) as any as BondType;
      bond2Info.id.toString().should.equal(1n.toString());
      bond2Info.enabled.should.be.false;

      const bond3Info = (await contract.bondTypes(
        2n.toString()
      )) as any as BondType;
      bond3Info.id.toString().should.equal(2n.toString());
      bond3Info.enabled.should.be.true;
    });
    it("should update a bond type", async () => {
      await contract.addBondType(
        {
          id: 0n.toString(),
          enabled: true,
          amount: (10n * 10n ** DECIMALS).toString(),
          multiplier100: 4n.toString(),
          matureDuration: (4n * 365n * 24n * 3600n).toString(),
          ui: {
            style: "coin-1",
            color: ["black", "white"],
            description: "Bond 1",
            name: "Bond 1",
            visible: true,
          },
        },
        { from: deployer }
      );

      await contract.updateBondType(
        {
          id: 0n.toString(),
          enabled: false,
          amount: (50n * 10n ** DECIMALS).toString(),
          multiplier100: 4n.toString(),
          matureDuration: (4n * 365n * 24n * 3600n).toString(),
          ui: {
            style: "coin-2",
            color: ["black", "white"],
            description: "Bond 1",
            name: "Bond 1",
            visible: true,
          },
        },
        { from: deployer }
      );

      const bond1Info = (await contract.bondTypes(
        0n.toString()
      )) as any as BondType;
      bond1Info.id.toString().should.equal(0n.toString());
      bond1Info.enabled.should.be.false;
      bond1Info.amount
        .toString()
        .should.equal((50n * 10n ** DECIMALS).toString());
    });
    it("should enumerate minted bonds", async () => {
      var { exists, bond } = (await contract.bondHead(user1)) as BondHead;

      exists.should.be.false;
      bond.toString().should.equal("0");

      await contract.addBondType(
        {
          id: 0n.toString(),
          enabled: true,
          amount: (10n * 10n ** DECIMALS).toString(),
          multiplier100: 4n.toString(),
          matureDuration: (4n * 365n * 24n * 3600n).toString(),
          ui: {
            style: "coin-1",
            color: ["black", "white"],
            description: "Bond 1",
            name: "Bond 1",
            visible: true,
          },
        },
        { from: deployer }
      );
      await contract.addBondType(
        {
          id: 0n.toString(),
          enabled: true,
          amount: (20n * 10n ** DECIMALS).toString(),
          multiplier100: 4n.toString(),
          matureDuration: (4n * 365n * 24n * 3600n).toString(),
          ui: {
            style: "coin-1",
            color: ["black", "white"],
            description: "Bond 1",
            name: "Bond 1",
            visible: true,
          },
        },
        { from: deployer }
      );

      await erc20.approve(
        contract.address,
        (400n * 10n ** DECIMALS).toString(),
        { from: user1 }
      );
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var { exists, bond } = (await contract.bondHead(user1)) as BondHead;
      exists.should.be.true;
      bond.toString().should.equal("0");

      var { exists, bond } = (await contract.bondHead(user2)) as BondHead;
      exists.should.be.false;
      bond.toString().should.equal("0");

      var { exists, bond } = (await contract.bondHead(deployer)) as BondHead;
      exists.should.be.false;
      bond.toString().should.equal("0");

      await contract.mint(1n.toString(), (120n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var { exists, bond } = (await contract.bondHead(user1)) as BondHead;
      exists.should.be.true;
      bond.toString().should.equal("1");

      var bondInfo = (await contract.bonds(user1, bond)) as any as Bond;

      bondInfo.balance
        .toString()
        .should.equal((120n * 10n ** DECIMALS).toString());

      var { exists, bond } = (await contract.bondNext(user1, bond)) as BondNext;
      exists.should.be.true;
      bond.toString().should.equal("0");

      var bondInfo = (await contract.bonds(user1, bond)) as any as Bond;

      bondInfo.balance
        .toString()
        .should.equal((100n * 10n ** DECIMALS).toString());
    });
    it("should respond with the next bond record, starting at 0", async () => {
      for (const coin of COINS) {
        await contract.addBondType({
          id: 0,
          enabled: true,
          amount: (BigInt(coin.value) * 10n ** DECIMALS).toString(),
          multiplier100: coin.multiplier,
          matureDuration: BigInt(coin.matureDuration).toString(),
          ui: {
            color: coin.color,
            name: coin.name,
            style: coin.style,
            description: coin.description ?? "",
            visible: true,
          },
        });
      }

      await erc20.approve(
        contract.address,
        (400_000_000n * 10n ** DECIMALS).toString(),
        { from: user1 }
      );
      await erc20.approve(
        contract.address,
        (400_000_000n * 10n ** DECIMALS).toString(),
        { from: user2 }
      );

      await contract.mint(
        0n.toString(),
        (11_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await contract.mint(
        1n.toString(),
        (12_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await contract.mint(
        3n.toString(),
        (140_000n * 10n ** DECIMALS).toString(),
        {
          from: user2,
        }
      );
      await contract.mint(
        2n.toString(),
        (13_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await contract.mint(
        3n.toString(),
        (14_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await contract.mint(
        1n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        {
          from: user2,
        }
      );
      await contract.mint(
        4n.toString(),
        (15_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await contract.mint(
        3n.toString(),
        (16_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await contract.mint(
        1n.toString(),
        (17_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await contract.mint(
        3n.toString(),
        (18_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(5);

      bonds[0].bondType.toString().should.equal(4n.toString());
      bonds[1].bondType.toString().should.equal(3n.toString());
      bonds[2].bondType.toString().should.equal(2n.toString());
      bonds[3].bondType.toString().should.equal(1n.toString());
      bonds[4].bondType.toString().should.equal(0n.toString());

      bonds[0].balance
        .toString()
        .should.equal((15_000n * 10n ** DECIMALS).toString());
      bonds[1].balance
        .toString()
        .should.equal((48_000n * 10n ** DECIMALS).toString());
      bonds[2].balance
        .toString()
        .should.equal((13_000n * 10n ** DECIMALS).toString());
      bonds[3].balance
        .toString()
        .should.equal((29_000n * 10n ** DECIMALS).toString());
      bonds[4].balance
        .toString()
        .should.equal((11_000n * 10n ** DECIMALS).toString());

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(2);

      bonds[0].bondType.toString().should.equal(1n.toString());
      bonds[1].bondType.toString().should.equal(3n.toString());

      bonds[0].balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());
      bonds[1].balance
        .toString()
        .should.equal((140_000n * 10n ** DECIMALS).toString());

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user3)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(0);

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(deployer)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(0);
    });
    it("should add a bond forge", async () => {
      await contract.addBondForge({
        description: "forge-1",
        enabled: true,
        id: 1,
        name: "forge-1",
        requirements: [
          {
            balance: (1_000n * 10n ** DECIMALS).toString(),
            bondType: 0,
            count: 3,
            multiplier100: 5000,
          },
        ],
        result: {
          bondType: 1,
          matureDuration: 3600,
          multiplier100: 1000,
        },
      });
      await contract.addBondForge({
        description: "forge-2",
        enabled: false,
        id: 4,
        name: "forge-2",
        requirements: [
          {
            balance: (4_000n * 10n ** DECIMALS).toString(),
            bondType: 1,
            count: 3,
            multiplier100: 2000,
          },
        ],
        result: {
          bondType: 2,
          matureDuration: 24 * 3600,
          multiplier100: 3000,
        },
      });

      const forge1 = contract.bondForges(0n.toString());
      const forge2 = contract.bondForges(1n.toString());

      // TODO: complete test
    });
    it("should update a bond forge");
  });

  describe("Token minting", () => {
    beforeEach(async () => {
      await erc20.approve(
        contract.address,
        (400_000_000n * 10n ** DECIMALS).toString(),
        { from: user1 }
      );

      for (const coin of COINS) {
        await contract.addBondType({
          id: 0,
          enabled: true,
          amount: (BigInt(coin.value) * 10n ** DECIMALS).toString(),
          multiplier100: coin.multiplier,
          matureDuration: BigInt(coin.matureDuration).toString(),
          ui: {
            color: coin.color,
            name: coin.name,
            style: coin.style,
            description: coin.description ?? "",
            visible: true,
          },
        });
      }
    });

    it("should mint tokens", async () => {
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });
    });

    it("should only mint for enabled bond types");
    it("should require bond type minimum amount to be met");
    it("should revert if allowance is not found in token");
    it("should transfer usdt to deposit account");
    it("should create a bond and issue tokens");
    it("should emit transfer events");
    it("should combine two bonds into single bond", async () => {
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var { exists, bond } = (await contract.bondHead(user1)) as BondHead;
      exists.should.be.true;
      bond.toString().should.equal("0");

      var bondInfo = (await contract.bonds(user1, bond)) as any as Bond;

      bondInfo.balance
        .toString()
        .should.equal((100n * 10n ** DECIMALS).toString());

      await contract.mint(0n.toString(), (120n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var { exists, bond } = (await contract.bondNext(user1, bond)) as BondNext;
      exists.should.be.false;
      bond.toString().should.equal("0");

      var bondInfo = (await contract.bonds(user1, "0")) as any as Bond;

      bondInfo.balance
        .toString()
        .should.equal((220n * 10n ** DECIMALS).toString());
    });
    it("should combine multiple bonds into single bond", async () => {
      await contract.mint(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await contract.mint(
        1n.toString(),
        (110_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await contract.mint(
        2n.toString(),
        (120_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await contract.mint(
        1n.toString(),
        (190_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await contract.mint(
        0n.toString(),
        (140_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await contract.mint(
        2n.toString(),
        (150_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      const bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds[0].bondType.toString().should.equal(2n.toString());
      bonds[1].bondType.toString().should.equal(1n.toString());
      bonds[2].bondType.toString().should.equal(0n.toString());
      bonds[0].balance
        .toString()
        .should.equal((270_000n * 10n ** DECIMALS).toString());
      bonds[1].balance
        .toString()
        .should.equal((300_000n * 10n ** DECIMALS).toString());
      bonds[2].balance
        .toString()
        .should.equal((240_000n * 10n ** DECIMALS).toString());
    });
    it("should set multiplier and matures");
    it("should not take transfer fee");
  });

  describe("Affiliate minting", () => {
    it("should mint and store affiliate data");
    it("it should not allow greater than maxAffiliateMultipliers");
  });

  describe("Token burning", () => {
    it("should only burn bonds from message sender");
    it("should only burn bonds with a balance");
    it("should only burn up to balance");
    it("should recompense the value invested with multiplier");
    it("should debit bond");
    it("should remove bond when balance is exhausted");
    it("should emit transfer events");
  });

  describe("Token linking", () => {
    it("should require inputs to be the same length");
    it("should require bond types to all be the same");
    it("should set multiplier to lowest of all the bonds");
    it("should set maturity to highest of all the bonds");
    it("should create a new bond after debiting the existing bonds");
    it("should delete existing bonds if they are exhausted");
    it("should not take tax for token linking");
  });

  describe("Token splitting", () => {
    it("should split the bonds in the proportions specified");
    it("should delete the existing bond");
  });

  describe("Token forging", () => {
    it("should forge based on multiplier requirement");
    it("should forge based on bond type requirement");
    it("should forge based on balance requirement");
    it("should forge based on count requirement");
    it("should correctly set maturation");
    it("should correctly set multiplier");
    it("should produce forged token");
  });

  describe("Token gifting", () => {
    it("should require signature");
    it("should allow account to be different to message sender");
    it("should result in gifted bond");
  });

  describe("Donating", () => {
    it("should allow donated funds to be used for withdrawals");
  });

  describe("Withdraw", () => {
    it("should withdraw funds into deposit account");
  });

  describe("ERC20 basic transfer functions", () => {
    it("should emit a transfer event");
    it("should transfer total balance");
    it("should transfer smallest unit");
    it("should not transfer more than available balance");
    it("should not transfer to zero address");
    it("should not transfer tokens to contract");
  });

  describe("ERC20 basic approvals", () => {
    it("should emit an approval event");
    it("should allow maximum uint256");
    it("should not transferFrom more than available balance");
    it("should deduct transferFrom amount from approval");
    it("should transferFrom smallest unit");
    it("should transferFrom available balance");
    it("should get the allowance");
    it(
      "should set approve tokens absolutely rather than adding to the approval"
    );
  });

  describe("NFT integration", () => {
    it("should represent balance of token in batch");
    it("should allow safe transfers");
    it("should prevent safe transfers to non-conformant contract");
    it("should do safe batch transfers");
    it("should approve maximum ERC20 when doing approvals");
    it("should not transferFrom more than available balance");
    it("should emit events from transfer");
    it("should emit batch events and not single events from batch transfer");
    it("should concatenate the url correctly");
  });

  describe("ERC165 implementation", () => {
    it("should support ERC20");
    it("should support ERC20Metadata");
    it("should support ERC1155");
    it("should support ERC1155MetadataURI");
  });

  describe("Safe guards", () => {
    it("prevent eth transfers", async () => {
      await web3.eth
        .sendTransaction({
          from: user1,
          to: contract.address,
          value: (1n ** 17n).toString(),
        })
        .should.eventually.rejectedWith();
    });

    it("should allow transfer out of other ERC20 tokens to deposit account");
  });
});
