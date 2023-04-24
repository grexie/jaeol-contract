/// <reference types="../../types/truffle-contracts/types.d.ts" />

import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import type {
  BondTokenInstance,
  TokenInstance,
} from "../../types/truffle-contracts";
import { eventEmitted } from "truffle-assertions";
import {
  Bond,
  BondType,
  BondHead,
  BondNext,
  BondForge,
  Config,
  BondTokenPtr,
} from "../types/index";
import BN from "bn.js";
import { Signer } from "@grexie/signable";

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

const advanceBlockAtTime = async (time: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    (web3.currentProvider as any).send(
      {
        jsonrpc: "2.0",
        method: "evm_mine",
        params: [time | 0],
        id: new Date().getTime(),
      },
      (err: any) => {
        if (err) {
          return reject(err);
        }

        return resolve();
      }
    );
  });
};

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
  let signer: ReturnType<(typeof web3)["eth"]["accounts"]["create"]>;
  const config = {
    depositAccount: wisdom,
    transferFee100: 1000n.toString(),
    minDeposit: (10n * 10n ** DECIMALS).toString(),
    minWithdraw: (40n * 10n ** DECIMALS).toString(),
    baseURI: "http://localhost:3000/bonds/",
    supplyCap: (400_000_000n * 10n ** DECIMALS).toString(),
    earlyMaturation: 0n.toString(),
    affiliateMultiplier100: 5n.toString(),
    maxAffiliateMultipliers: 10n.toString(),
    minAffiliateBondAmount100: 50n.toString(),
  } as any;

  const iterateBonds = async function* (account: string) {
    var { exists, bond } = (await contract.bondHead(
      account
    )) as any as BondHead;

    while (exists) {
      yield (await contract.bonds(account, bond)) as any as Bond;

      var { exists, bond } = (await contract.bondNext(
        account,
        bond
      )) as any as BondNext;
    }
  };

  beforeEach(async () => {
    erc20 = (await ERC20Token.new("Test USDT", "USDT", {
      from: deployer,
    })) as any;
    const decimals = BigInt((await erc20.decimals()).toString());

    await erc20.mint((40_000_000_000n * 10n ** decimals).toString(), {
      from: user1,
    });
    await erc20.mint((40_000_000_000n * 10n ** decimals).toString(), {
      from: user2,
    });
    await erc20.mint((40_000_000_000n * 10n ** decimals).toString(), {
      from: user3,
    });

    config.usdt = erc20.address;

    contract = (await BondToken.new(
      "Wisdom and Love Bond",
      "BOND",
      {
        affiliateMultiplier100: config.affiliateMultiplier100,
        baseURI: config.baseURI,
        depositAccount: config.depositAccount,
        earlyMaturation: config.earlyMaturation,
        maxAffiliateMultipliers: config.maxAffiliateMultipliers,
        minAffiliateBondAmount100: config.minAffiliateBondAmount100,
        minDeposit: config.minDeposit,
        minWithdraw: config.minWithdraw,
        supplyCap: config.supplyCap,
        transferFee100: config.transferFee100,
        usdt: config.usdt,
      },
      {
        from: deployer,
      }
    )) as any;

    signer = web3.eth.accounts.create();
    await contract.setSigner(signer.address, { from: deployer });
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
      var { exists, bond } = (await contract.bondHead(
        user1
      )) as any as BondHead;

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

      var { exists, bond } = (await contract.bondHead(
        user1
      )) as any as BondHead;
      exists.should.be.true;
      bond.toString().should.equal("0");

      var { exists, bond } = (await contract.bondHead(
        user2
      )) as any as BondHead;
      exists.should.be.false;
      bond.toString().should.equal("0");

      var { exists, bond } = (await contract.bondHead(
        deployer
      )) as any as BondHead;
      exists.should.be.false;
      bond.toString().should.equal("0");

      await contract.mint(1n.toString(), (120n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var { exists, bond } = (await contract.bondHead(
        user1
      )) as any as BondHead;
      exists.should.be.true;
      bond.toString().should.equal("1");

      var bondInfo = (await contract.bonds(user1, bond)) as any as Bond;

      bondInfo.balance
        .toString()
        .should.equal((120n * 10n ** DECIMALS).toString());

      var { exists, bond } = (await contract.bondNext(
        user1,
        bond
      )) as any as BondNext;
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

      const forge1 = (await contract.getBondForge(
        0n.toString()
      )) as any as BondForge;
      const forge2 = (await contract.getBondForge(
        1n.toString()
      )) as any as BondForge;

      forge1.id.toString().should.equal(0n.toString());
      forge1.requirements[0].balance
        .toString()
        .should.equal((1_000n * 10n ** DECIMALS).toString());
      forge2.id.toString().should.equal(1n.toString());
      forge2.requirements[0].balance
        .toString()
        .should.equal((4_000n * 10n ** DECIMALS).toString());
    });
    it("should update a bond forge", async () => {
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

      await contract.updateBondForge({
        description: "forge-3",
        enabled: true,
        id: 0,
        name: "forge-1",
        requirements: [
          {
            balance: (1_000n * 10n ** DECIMALS).toString(),
            bondType: 0,
            count: 3,
            multiplier100: 5000,
          },
          {
            balance: (3_000n * 10n ** DECIMALS).toString(),
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

      const forge1 = (await contract.getBondForge(
        0n.toString()
      )) as any as BondForge;

      forge1.description.should.equal("forge-3");
      forge1.requirements[0].balance.should.equal(
        (1_000n * 10n ** DECIMALS).toString()
      );
      forge1.requirements[1].balance.should.equal(
        (3_000n * 10n ** DECIMALS).toString()
      );
    });
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

    it("should only mint for enabled bond types", async () => {
      const coin = COINS[0];

      await contract.updateBondType({
        id: 0,
        enabled: false,
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

      await contract
        .mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
          from: user1,
        })
        .should.eventually.rejectedWith();
    });
    it("should require bond type minimum amount to be met", async () => {
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await contract
        .mint(
          0n.toString(),
          (BigInt(COINS[0].value) * 10n ** DECIMALS - 1n).toString(),
          {
            from: user1,
          }
        )
        .should.eventually.rejectedWith();
    });
    it("should revert if allowance is not found in token", async () => {
      await erc20.approve(contract.address, 0, { from: user1 });
      await contract
        .mint(
          0n.toString(),
          (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
          {
            from: user1,
          }
        )
        .should.eventually.rejectedWith();
    });
    it("should transfer usdt to deposit account", async () => {
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      const usdt = await erc20.balanceOf(wisdom);
      usdt
        .toString()
        .should.equal((BigInt(COINS[0].value) * 10n ** DECIMALS).toString());
    });
    it("should create a bond and issue tokens", async () => {
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      var balance = await contract.methods["balanceOf(address)"](user1);

      balance
        .toString()
        .should.equal((BigInt(COINS[0].value) * 10n ** DECIMALS).toString());

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      var balance = await contract.methods["balanceOf(address,uint256)"](
        user1,
        bonds[0].token
      );

      balance
        .toString()
        .should.equal((BigInt(COINS[0].value) * 10n ** DECIMALS).toString());

      bonds[0].balance.toString().should.equal(balance.toString());
    });
    it("should emit transfer events", async () => {
      const result = await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      eventEmitted(result, "Transfer", (event: any) => {
        return (
          event.from === ZERO_ADDRESS &&
          event.to === user1 &&
          event.value.toString() ===
            (BigInt(COINS[0].value) * 10n ** DECIMALS).toString()
        );
      });

      eventEmitted(result, "TransferSingle", (event: any) => {
        return (
          event.operator == user1 &&
          event.from === ZERO_ADDRESS &&
          event.to === user1 &&
          event.id.toString() === bonds[0].token.toString() &&
          event.value.toString() ===
            (BigInt(COINS[0].value) * 10n ** DECIMALS).toString()
        );
      });
    });
    it("should combine two bonds into single bond", async () => {
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var { exists, bond } = (await contract.bondHead(
        user1
      )) as any as BondHead;
      exists.should.be.true;
      bond.toString().should.equal("0");

      var bondInfo = (await contract.bonds(user1, bond)) as any as Bond;

      bondInfo.balance
        .toString()
        .should.equal((100n * 10n ** DECIMALS).toString());

      await contract.mint(0n.toString(), (120n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var { exists, bond } = (await contract.bondNext(
        user1,
        bond
      )) as any as BondNext;
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
    it("should set multiplier and matures", async () => {
      const time = (Date.now() / 1000) | 0;
      await advanceBlockAtTime(time);

      await contract.mint(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      const bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds[0].multiplier100
        .toString()
        .should.equal(COINS[0].multiplier.toString());
      bonds[0].matures
        .toString()
        .should.equal((time + COINS[0].matureDuration).toString());
    });
    it("should not take transfer fee", async () => {
      await contract.mint(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      var balance = await contract.methods["balanceOf(address)"](user1);

      balance.toString().should.equal((100_000n * 10n ** DECIMALS).toString());

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      var balance = await contract.methods["balanceOf(address,uint256)"](
        user1,
        bonds[0].token
      );

      balance.toString().should.equal((100_000n * 10n ** DECIMALS).toString());

      bonds[0].balance.toString().should.equal(balance.toString());
    });

    it("should mint new bonds after one week has elapsed", async () => {
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });
      await advanceBlockAtTime(startTime + 3600 + 7 * 24 * 3600 + 3600);

      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });
      await advanceBlockAtTime(
        startTime + 3600 + 7 * 24 * 3600 + 7 * 24 * 3600 + 3600
      );
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(3);
    });
  });

  describe("Affiliate minting", () => {
    let timestamp = (Date.now() / 1000) | 0;

    beforeEach(async () => {
      advanceBlockAtTime(timestamp);

      await erc20.approve(
        contract.address,
        (400_000_000_000n * 10n ** DECIMALS).toString(),
        { from: user1 }
      );
      await erc20.approve(
        contract.address,
        (400_000_000_000n * 10n ** DECIMALS).toString(),
        { from: user2 }
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

      await contract.mint(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        { from: user2 }
      );
    });

    it("should mint and store affiliate data", async () => {
      const _signer = new Signer({
        keyStore: {
          async get(signerAddress: string): Promise<string> {
            return signer.privateKey;
          },
        },
        address: contract.address,
        web3,
      });

      const expires = timestamp + 15;

      const signature = await _signer.sign(
        contract.abi,
        "mintAffiliate",
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires,
        {
          account: user2,
          bond: 0n.toString(),
        }
      );

      await contract.mintAffiliate(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires,
        {
          account: user2,
          bond: 0n.toString(),
        },
        signature,
        { from: user1 }
      );

      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      bonds1.length.should.equal(1);
      bonds1[0].affiliateMultipliers.toString().should.equal(0n.toString());
      bonds1[0].multiplier100
        .toString()
        .should.equal(BigInt(COINS[0].multiplier).toString());
      bonds1[0].balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());

      var bonds2: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds2.push(bond);
      }

      bonds2.length.should.equal(1);
      bonds2[0].affiliateMultipliers.toString().should.equal(1n.toString());
      bonds2[0].multiplier100
        .toString()
        .should.equal(
          (
            BigInt(COINS[0].multiplier) +
            BigInt(config.affiliateMultiplier100.toString())
          ).toString()
        );
      bonds2[0].balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());

      bonds1[0].token.toString().should.not.equal(bonds2[0].token.toString());
    });
    it("should mint but not affiliate data if lower than threshold", async () => {
      const _signer = new Signer({
        keyStore: {
          async get(signerAddress: string): Promise<string> {
            return signer.privateKey;
          },
        },
        address: contract.address,
        web3,
      });

      const expires = timestamp + 15;

      const signature = await _signer.sign(
        contract.abi,
        "mintAffiliate",
        user1,
        0n.toString(),
        (49_999n * 10n ** DECIMALS).toString(),
        expires,
        {
          account: user2,
          bond: 0n.toString(),
        }
      );

      await contract.mintAffiliate(
        0n.toString(),
        (49_999n * 10n ** DECIMALS).toString(),
        expires,
        {
          account: user2,
          bond: 0n.toString(),
        },
        signature,
        { from: user1 }
      );

      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      bonds1.length.should.equal(1);
      bonds1[0].affiliateMultipliers.toString().should.equal(0n.toString());
      bonds1[0].multiplier100
        .toString()
        .should.equal(BigInt(COINS[0].multiplier).toString());
      bonds1[0].balance
        .toString()
        .should.equal((49_999n * 10n ** DECIMALS).toString());

      var bonds2: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds2.push(bond);
      }

      bonds2.length.should.equal(1);
      bonds2[0].affiliateMultipliers.toString().should.equal(0n.toString());
      bonds2[0].multiplier100
        .toString()
        .should.equal(BigInt(COINS[0].multiplier).toString());
      bonds2[0].balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());

      bonds1[0].token.toString().should.not.equal(bonds2[0].token.toString());
    });
    it("it should not allow greater than maxAffiliateMultipliers", async () => {
      for (let i = 0; i < Number(config.maxAffiliateMultipliers) * 2; i++) {
        const _signer = new Signer({
          keyStore: {
            async get(signerAddress: string): Promise<string> {
              return signer.privateKey;
            },
          },
          address: contract.address,
          web3,
        });

        const expires = timestamp + 15;

        const signature = await _signer.sign(
          contract.abi,
          "mintAffiliate",
          user1,
          0n.toString(),
          (50_000n * 10n ** DECIMALS).toString(),
          expires,
          {
            account: user2,
            bond: 0n.toString(),
          }
        );

        await contract.mintAffiliate(
          0n.toString(),
          (50_000n * 10n ** DECIMALS).toString(),
          expires,
          {
            account: user2,
            bond: 0n.toString(),
          },
          signature,
          { from: user1 }
        );

        var bonds1: Bond[] = [];
        for await (const bond of iterateBonds(user1)) {
          bonds1.push(bond);
        }

        bonds1.length.should.equal(1);
        bonds1[0].affiliateMultipliers.toString().should.equal(0n.toString());
        bonds1[0].multiplier100
          .toString()
          .should.equal(BigInt(COINS[0].multiplier).toString());

        var bonds2: Bond[] = [];
        for await (const bond of iterateBonds(user2)) {
          bonds2.push(bond);
        }

        let multipliers = Math.min(
          i + 1,
          Number(config.maxAffiliateMultipliers)
        );

        bonds2.length.should.equal(1);
        bonds2[0].affiliateMultipliers
          .toString()
          .should.equal(multipliers.toString());
        bonds2[0].multiplier100
          .toString()
          .should.equal(
            (
              BigInt(COINS[0].multiplier) +
              BigInt(multipliers) *
                BigInt(config.affiliateMultiplier100.toString())
            ).toString()
          );
        bonds2[0].balance
          .toString()
          .should.equal((100_000n * 10n ** DECIMALS).toString());

        bonds1[0].token.toString().should.not.equal(bonds2[0].token.toString());
      }
    });
  });

  describe("Token burning", () => {
    beforeEach(async () => {
      await erc20.approve(
        contract.address,
        (400_000_000n * 10n ** DECIMALS).toString(),
        { from: user1 }
      );

      await erc20.transfer(
        contract.address,
        (1_600_000_000n * 10n ** DECIMALS).toString(),
        { from: user3 }
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

    it("should allow withdrawals after maturation", async () => {
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      await advanceBlockAtTime(Number(bonds[0].matures.toString()));

      const balanceBefore = await erc20.balanceOf(user1);
      const totalSupplyBefore = await contract.totalSupply();

      totalSupplyBefore
        .toString()
        .should.equal((100n * 10n ** DECIMALS).toString());

      await contract.burn(
        0n.toString(),
        bonds[0].balance.toString().toString(),
        { from: user1 }
      );

      const balanceAfter = await erc20.balanceOf(user1);
      const totalSupplyAfter = await contract.totalSupply();

      totalSupplyAfter.toString().should.equal("0");

      (BigInt(balanceAfter.toString()) - BigInt(balanceBefore.toString()))
        .toString()
        .should.equal(
          (
            (BigInt(bonds[0].balance.toString()) *
              BigInt(bonds[0].multiplier100.toString())) /
            100n
          ).toString()
        );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(0);
    });
    it("should only burn bonds from message sender", async () => {
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      await advanceBlockAtTime(Number(bonds[0].matures.toString()) + 3600);

      await contract
        .burn(0n.toString(), bonds[0].balance.toString().toString(), {
          from: user2,
        })
        .should.eventually.rejectedWith();
    });
    it("should only burn bonds with a balance", async () => {
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      await advanceBlockAtTime(Number(bonds[0].matures.toString()) + 3600);

      await contract.burn(
        0n.toString(),
        bonds[0].balance.toString().toString(),
        {
          from: user1,
        }
      );

      await contract
        .burn(0n.toString(), bonds[0].balance.toString().toString(), {
          from: user1,
        })
        .should.eventually.rejectedWith();
    });
    it("should only burn up to balance", async () => {
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      await advanceBlockAtTime(Number(bonds[0].matures.toString()) + 3600);

      await contract
        .burn(
          0n.toString(),
          (BigInt(bonds[0].balance.toString()) + 1n).toString(),
          { from: user1 }
        )
        .should.eventually.rejectedWith();
    });
    it("should emit transfer events", async () => {
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      await advanceBlockAtTime(Number(bonds[0].matures.toString()) + 3600);

      const result = await contract.burn(
        0n.toString(),
        BigInt(bonds[0].balance.toString()).toString(),
        {
          from: user1,
        }
      );

      eventEmitted(result, "Transfer", (args: any) => {
        return (
          args.from === user1 &&
          args.to === ZERO_ADDRESS &&
          args.value.toString() == bonds[0].balance.toString()
        );
      });

      eventEmitted(result, "TransferSingle", (args: any) => {
        return (
          args.operator === user1 &&
          args.from === user1 &&
          args.to === ZERO_ADDRESS &&
          args.id.toString() === bonds[0].token.toString() &&
          args.value.toString() === bonds[0].balance.toString()
        );
      });
    });
  });

  describe("Token linking", () => {
    beforeEach(async () => {
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

      await contract.mint(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        { from: user2 }
      );
    });

    it("should require inputs to be the same length", async () => {
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });
      await advanceBlockAtTime(startTime + 3600 + 7 * 24 * 3600 + 3600);

      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      await advanceBlockAtTime(
        startTime + 3600 + 7 * 24 * 3600 + 7 * 24 * 3600 + 3600
      );
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(3);

      await contract
        .link(
          bonds.map((b) => b.id),
          bonds.map((b) => b.balance).slice(1),
          { from: user1 }
        )
        .should.eventually.rejectedWith();

      await contract.link(
        bonds.map((b) => b.id.toString()),
        bonds.map((b) => b.balance.toString()),
        { from: user1 }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      bonds[0].balance
        .toString()
        .should.equal((300n * 10n ** DECIMALS).toString());
    });

    it("should require bond types to all be the same", async () => {
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });
      await advanceBlockAtTime(startTime + 3600 + 7 * 24 * 3600 + 3600);

      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      await contract.mint(1n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      await advanceBlockAtTime(
        startTime + 3600 + 7 * 24 * 3600 + 7 * 24 * 3600 + 3600
      );
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(4);

      await contract
        .link(
          bonds.map((b) => b.id),
          bonds.map((b) => b.balance)
        )
        .should.eventually.rejectedWith();

      await contract.link(
        bonds
          .filter((b) => b.bondType.toString() === 0n.toString())
          .map((b) => b.id.toString()),
        bonds
          .filter((b) => b.bondType.toString() === 0n.toString())
          .map((b) => b.balance.toString()),
        { from: user1 }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      bonds[0].balance
        .toString()
        .should.equal((300n * 10n ** DECIMALS).toString());
    });
    it("should set multiplier to lowest of all the bonds", async () => {
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);

      await contract.split(
        0n.toString(),
        [
          (50_000n * 10n ** DECIMALS).toString(),
          (50_000n * 10n ** DECIMALS).toString(),
        ],
        { from: user2 }
      );

      const _signer = new Signer({
        keyStore: {
          async get(signerAddress: string): Promise<string> {
            return signer.privateKey;
          },
        },
        address: contract.address,
        web3,
      });

      const expires = startTime + 15;

      const signature = await _signer.sign(
        contract.abi,
        "mintAffiliate",
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires,
        {
          account: user2,
          bond: 2n.toString(),
        }
      );

      await contract.mintAffiliate(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires,
        {
          account: user2,
          bond: 2n.toString(),
        },
        signature,
        { from: user1 }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds.push(bond);
      }

      await contract.link(
        [1n.toString(), 2n.toString()],
        [
          (50_000n * 10n ** DECIMALS).toString(),
          (50_000n * 10n ** DECIMALS).toString(),
        ],
        { from: user2 }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);
      bonds[0].balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());
      bonds[0].multiplier100
        .toString()
        .should.equal(COINS[0].multiplier.toString());
    });
    it("should set applied affiliate multiplier count to highest of all the bonds", async () => {
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);

      await contract.split(
        0n.toString(),
        [
          (50_000n * 10n ** DECIMALS).toString(),
          (50_000n * 10n ** DECIMALS).toString(),
        ],
        { from: user2 }
      );

      const _signer = new Signer({
        keyStore: {
          async get(signerAddress: string): Promise<string> {
            return signer.privateKey;
          },
        },
        address: contract.address,
        web3,
      });

      const expires = startTime + 15;

      const signature = await _signer.sign(
        contract.abi,
        "mintAffiliate",
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires,
        {
          account: user2,
          bond: 2n.toString(),
        }
      );

      await contract.mintAffiliate(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires,
        {
          account: user2,
          bond: 2n.toString(),
        },
        signature,
        { from: user1 }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds.push(bond);
      }

      await contract.link(
        [1n.toString(), 2n.toString()],
        [
          (50_000n * 10n ** DECIMALS).toString(),
          (50_000n * 10n ** DECIMALS).toString(),
        ],
        { from: user2 }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);
      bonds[0].balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());
      bonds[0].multiplier100
        .toString()
        .should.equal(COINS[0].multiplier.toString());
      bonds[0].affiliateMultipliers.toString().should.equal("1");
    });
    it("should set maturity to highest of all the bonds", async () => {
      const startTime = Number((await web3.eth.getBlock("latest")).timestamp);

      await advanceBlockAtTime(startTime);
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });
      await advanceBlockAtTime(startTime + 7 * 24 * 3600 + 3600);

      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });
      await advanceBlockAtTime(
        startTime + 7 * 24 * 3600 + 3600 + 7 * 24 * 3600 + 3600
      );
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      await contract.link(
        bonds.map((b) => b.id.toString()),
        bonds.map((b) => b.balance.toString()),
        { from: user1 }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      bonds[0].matures
        .toString()
        .should.equal(
          (
            startTime +
            7 * 24 * 3600 +
            3600 +
            7 * 24 * 3600 +
            3600 +
            COINS[0].matureDuration
          ).toString()
        );
    });
  });

  describe("Token splitting", () => {
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

    it("should split the bonds in the proportions specified", async () => {
      await contract.mint(0n.toString(), (100n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);

      await contract.split(
        bonds[0].id.toString(),
        [
          1n.toString(),
          5n.toString(),
          (100n * 10n ** DECIMALS - 6n).toString(),
        ],
        { from: user1 }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(3);
      bonds[0].id.toString().should.not.equal(0n.toString());
      bonds[0].balance
        .toString()
        .should.equal((100n * 10n ** DECIMALS - 6n).toString());
      bonds[1].balance.toString().should.equal(5n.toString());
      bonds[2].balance.toString().should.equal(1n.toString());
    });
  });

  describe("Token forging", () => {
    beforeEach(async () => {
      await advanceBlockAtTime((Date.now() / 1000) | 0);

      await erc20.approve(
        contract.address,
        (400_000_000_000n * 10n ** DECIMALS).toString(),
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

    it("should forge based on at least 15 requirements", async () => {
      await contract.addBondForge({
        description: "forge-1",
        enabled: true,
        name: "forge-1",
        requirements: [
          ...COINS.slice(1).map((coin, i) => ({
            bondType: i + 1,
            count: 1,
            balance: (BigInt(coin.value) * 10n ** DECIMALS).toString(),
            multiplier100: coin.multiplier.toString(),
          })),
          {
            bondType: 0,
            count: 3,
            balance: (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
            multiplier100: COINS[0].multiplier.toString(),
          },
        ],
        result: {
          bondType: 0,
          matureDuration: 100,
          multiplier100: 50000,
        },
        id: 0,
      });
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      for (const i in COINS) {
        await advanceBlockAtTime(startTime);
        await contract.mint(
          i.toString(),
          (BigInt(COINS[i].value) * 10n ** DECIMALS).toString(),
          {
            from: user1,
          }
        );
      }

      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 1);
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 2);
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 3);

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(COINS.length + 2);

      await contract.forge(
        0n.toString(),
        bonds.map((b) => b.id.toString()),
        bonds.map((b) => b.balance.toString()),
        { from: user1 }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);
      bonds[0].id.toString().should.equal((COINS.length + 2).toString());
      bonds[0].balance
        .toString()
        .should.equal(
          (
            [COINS[0], COINS[0], ...COINS].reduce(
              (a, b) => a + BigInt(b.value),
              0n
            ) *
            10n ** DECIMALS
          ).toString()
        );
      bonds[0].multiplier100.toString().should.equal(50000n.toString());
      bonds[0].matures
        .toString()
        .should.equal(
          (startTime + 3600 + (7 * 24 * 3600 + 3600) * 3 + 100).toString()
        );
    });

    it("should forge based on balance requirement", async () => {
      await contract.addBondForge({
        description: "forge-1",
        enabled: true,
        name: "forge-1",
        requirements: [
          ...COINS.slice(1).map((coin, i) => ({
            bondType: i + 1,
            count: 1,
            balance: (BigInt(coin.value) * 10n ** DECIMALS).toString(),
            multiplier100: coin.multiplier.toString(),
          })),
          {
            bondType: 0,
            count: 3,
            balance: (BigInt(COINS[0].value) * 10n ** DECIMALS + 1n).toString(),
            multiplier100: COINS[0].multiplier.toString(),
          },
        ],
        result: {
          bondType: 0,
          matureDuration: 100,
          multiplier100: 50000,
        },
        id: 0,
      });
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);

      for (const i in COINS) {
        await contract.mint(
          i.toString(),
          (BigInt(COINS[i].value) * 10n ** DECIMALS).toString(),
          {
            from: user1,
          }
        );
      }

      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 1);
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 2);
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 3);

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(COINS.length + 2);

      await contract
        .forge(
          0n.toString(),
          bonds.map((b) => b.id.toString()),
          bonds.map((b) => b.balance.toString()),
          { from: user1 }
        )
        .should.eventually.rejectedWith();
    });

    it("should forge based on bond type requirement", async () => {
      await contract.addBondForge({
        description: "forge-1",
        enabled: true,
        name: "forge-1",
        requirements: [
          ...COINS.slice(1).map((coin, i) => ({
            bondType: i + 1,
            count: 1,
            balance: (BigInt(coin.value) * 10n ** DECIMALS).toString(),
            multiplier100: coin.multiplier.toString(),
          })),
          {
            bondType: 0,
            count: 3,
            balance: (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
            multiplier100: COINS[0].multiplier.toString(),
          },
        ],
        result: {
          bondType: 0,
          matureDuration: 100,
          multiplier100: 50000,
        },
        id: 0,
      });
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);

      for (const i in COINS.slice(0, COINS.length - 1)) {
        await contract.mint(
          i.toString(),
          (BigInt(COINS[i].value) * 10n ** DECIMALS).toString(),
          {
            from: user1,
          }
        );
      }

      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 1);
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 2);
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 3);

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(COINS.length + 1);

      await contract
        .forge(
          0n.toString(),
          bonds.map((b) => b.id.toString()),
          bonds.map((b) => b.balance.toString()),
          { from: user1 }
        )
        .should.eventually.rejectedWith();
    });
    it("should forge based on multiplier requirement", async () => {
      await contract.addBondForge({
        description: "forge-1",
        enabled: true,
        name: "forge-1",
        requirements: [
          ...COINS.slice(1).map((coin, i) => ({
            bondType: i + 1,
            count: 1,
            balance: (BigInt(coin.value) * 10n ** DECIMALS).toString(),
            multiplier100: coin.multiplier.toString(),
          })),
          {
            bondType: 0,
            count: 3,
            balance: (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
            multiplier100: (COINS[0].multiplier + 1).toString(),
          },
        ],
        result: {
          bondType: 0,
          matureDuration: 100,
          multiplier100: 50000,
        },
        id: 0,
      });
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);

      for (const i in COINS.slice(0, COINS.length)) {
        await contract.mint(
          i.toString(),
          (BigInt(COINS[i].value) * 10n ** DECIMALS).toString(),
          {
            from: user1,
          }
        );
      }

      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 1);
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 2);
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 3);

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(COINS.length + 2);

      await contract
        .forge(
          0n.toString(),
          bonds.map((b) => b.id.toString()),
          bonds.map((b) => b.balance.toString()),
          { from: user1 }
        )
        .should.eventually.rejectedWith();
    });
    it("should forge based on count requirement", async () => {
      await contract.addBondForge({
        description: "forge-1",
        enabled: true,
        name: "forge-1",
        requirements: [
          ...COINS.slice(1).map((coin, i) => ({
            bondType: i + 1,
            count: 1,
            balance: (BigInt(coin.value) * 10n ** DECIMALS).toString(),
            multiplier100: coin.multiplier.toString(),
          })),
          {
            bondType: 0,
            count: 4,
            balance: (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
            multiplier100: COINS[0].multiplier.toString(),
          },
        ],
        result: {
          bondType: 0,
          matureDuration: 100,
          multiplier100: 50000,
        },
        id: 0,
      });
      const startTime = ((Date.now() / 1000) | 0) + 3600;

      await advanceBlockAtTime(startTime);

      for (const i in COINS) {
        await contract.mint(
          i.toString(),
          (BigInt(COINS[i].value) * 10n ** DECIMALS).toString(),
          {
            from: user1,
          }
        );
      }

      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 1);
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 2);
      await contract.mint(
        0n.toString(),
        (BigInt(COINS[0].value) * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await advanceBlockAtTime(startTime + 3600 + (7 * 24 * 3600 + 3600) * 3);

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(COINS.length + 2);

      await contract
        .forge(
          0n.toString(),
          bonds.map((b) => b.id.toString()),
          bonds.map((b) => b.balance.toString()),
          { from: user1 }
        )
        .should.eventually.rejectedWith();
    });
  });

  describe("Token gifting", () => {
    let timestamp = (Date.now() / 1000) | 0;

    beforeEach(async () => {
      advanceBlockAtTime(timestamp);

      await erc20.approve(
        contract.address,
        (400_000_000_000n * 10n ** DECIMALS).toString(),
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

    it("should gift", async () => {
      const _signer = new Signer({
        keyStore: {
          async get(signerAddress: string): Promise<string> {
            return signer.privateKey;
          },
        },
        address: contract.address,
        web3,
      });

      const expires = timestamp + 15;

      const signature = await _signer.sign(
        contract.abi,
        "gift",
        user1,
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires
      );

      await contract.gift(
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires,
        signature,
        { from: user1 }
      );
    });

    it("should require signature", async () => {
      const _signer = new Signer({
        keyStore: {
          async get(signerAddress: string): Promise<string> {
            return signer.privateKey;
          },
        },
        address: contract.address,
        web3,
      });

      const expires = timestamp + 15;

      const signature = await _signer.sign(
        contract.abi,
        "gift",
        user1,
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires
      );

      signature.v = 0x34;

      await contract
        .gift(
          user1,
          0n.toString(),
          (100_000n * 10n ** DECIMALS).toString(),
          expires,
          signature,
          { from: user1 }
        )
        .should.eventually.rejectedWith();
    });
    it("should allow account to be different to message sender", async () => {
      const _signer = new Signer({
        keyStore: {
          async get(signerAddress: string): Promise<string> {
            return signer.privateKey;
          },
        },
        address: contract.address,
        web3,
      });

      const expires = timestamp + 15;

      const signature = await _signer.sign(
        contract.abi,
        "gift",
        user2,
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires
      );

      await contract.gift(
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires,
        signature,
        { from: user2 }
      );
    });
    it("should expire transaction", async () => {
      const _signer = new Signer({
        keyStore: {
          async get(signerAddress: string): Promise<string> {
            return signer.privateKey;
          },
        },
        address: contract.address,
        web3,
      });

      const expires = timestamp - 1;

      const signature = await _signer.sign(
        contract.abi,
        "gift",
        user2,
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires
      );

      await contract
        .gift(
          user1,
          0n.toString(),
          (100_000n * 10n ** DECIMALS).toString(),
          expires,
          signature,
          { from: user2 }
        )
        .should.eventually.rejectedWith();
    });

    it("should result in gifted bond", async () => {
      const _signer = new Signer({
        keyStore: {
          async get(signerAddress: string): Promise<string> {
            return signer.privateKey;
          },
        },
        address: contract.address,
        web3,
      });

      const expires = timestamp + 15;

      const signature = await _signer.sign(
        contract.abi,
        "gift",
        user2,
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires
      );

      await contract.gift(
        user1,
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        expires,
        signature,
        { from: user2 }
      );

      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      bonds.length.should.equal(1);
      bonds[0].balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());
    });
  });

  describe("Withdraw", () => {
    it("should withdraw funds into deposit account", async () => {
      await erc20.transfer(
        contract.address,
        (100_000n * 10n ** DECIMALS).toString(),
        { from: user1 }
      );
      await contract.withdraw((100_000n * 10n ** DECIMALS).toString(), {
        from: deployer,
      });
      const balance = await erc20.balanceOf(wisdom);
      balance.toString().should.equal((100_000n * 10n ** DECIMALS).toString());
    });
  });

  describe("ERC20 basic transfer functions", () => {
    beforeEach(async () => {
      await erc20.approve(
        contract.address,
        (400_000_000_000n * 10n ** DECIMALS).toString(),
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

      await contract.mint(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
    });

    it("should emit a transfer event", async () => {
      const result = await contract.transfer(
        user2,
        (50_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      var bonds2: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds2.push(bond);
      }

      const user1Balance = await contract.methods["balanceOf(address)"](user1);
      const user2Balance = await contract.methods["balanceOf(address)"](user2);

      user1Balance
        .toString()
        .should.equal((50_000n * 10n ** DECIMALS).toString());
      user2Balance
        .toString()
        .should.equal((45_000n * 10n ** DECIMALS).toString());

      eventEmitted(result, "Transfer", (event: any) => {
        return (
          event.from === user1 &&
          event.to === user2 &&
          event.value.toString() === (45_000n * 10n ** DECIMALS).toString()
        );
      });

      eventEmitted(result, "TransferSingle", (event: any) => {
        return (
          event.operator === user1 &&
          event.from === user1 &&
          event.to === ZERO_ADDRESS &&
          event.id.toString() === bonds1[0].token.toString() &&
          event.value.toString() === (45_000n * 10n ** DECIMALS).toString()
        );
      });

      eventEmitted(result, "TransferSingle", (event: any) => {
        return (
          event.operator === user1 &&
          event.from === ZERO_ADDRESS &&
          event.to === user2 &&
          event.id.toString() === bonds2[0].token.toString() &&
          event.value.toString() === (45_000n * 10n ** DECIMALS).toString()
        );
      });
    });
    it("should transfer total balance", async () => {
      await contract.transfer(user2, (100_000n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      var bonds2: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds2.push(bond);
      }

      const user1Balance = await contract.methods["balanceOf(address)"](user1);
      const user2Balance = await contract.methods["balanceOf(address)"](user2);

      user1Balance.toString().should.equal((0n * 10n ** DECIMALS).toString());
      user2Balance
        .toString()
        .should.equal((90_000n * 10n ** DECIMALS).toString());
    });
    it("should transfer smallest unit", async () => {
      await contract.transfer(user2, 1n.toString(), {
        from: user1,
      });

      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      var bonds2: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds2.push(bond);
      }

      const user1Balance = await contract.methods["balanceOf(address)"](user1);
      const user2Balance = await contract.methods["balanceOf(address)"](user2);

      user1Balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS - 1n).toString());
      user2Balance.toString().should.equal(1n.toString());
    });
    it("should not transfer more than available balance", async () => {
      await contract
        .transfer(user2, (100_000n * 10n ** DECIMALS + 1n).toString(), {
          from: user1,
        })
        .should.eventually.rejectedWith();
    });
    it("should not transfer to zero address", async () => {
      await contract
        .transfer(ZERO_ADDRESS, (50_000n * 10n ** DECIMALS).toString(), {
          from: user1,
        })
        .should.eventually.rejectedWith();
    });
    it("should not transfer tokens to contract", async () => {
      await contract
        .transfer(contract.address, (50_000n * 10n ** DECIMALS).toString(), {
          from: user1,
        })
        .should.eventually.rejectedWith();
    });
  });

  describe("ERC20 basic approvals", () => {
    beforeEach(async () => {
      await erc20.approve(
        contract.address,
        (400_000_000_000n * 10n ** DECIMALS).toString(),
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

      await contract.mint(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
    });

    it("should emit an approval event", async () => {
      const result = await contract.approve(
        user2,
        (100_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      var user1Balance = await contract.methods["balanceOf(address)"](user1);
      var user2Balance = await contract.methods["balanceOf(address)"](user2);

      user1Balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());
      user2Balance.toString().should.equal(0n.toString());

      await contract.transferFrom(
        user1,
        user2,
        (100_000n * 10n ** DECIMALS).toString(),
        { from: user2 }
      );

      var user1Balance = await contract.methods["balanceOf(address)"](user1);
      var user2Balance = await contract.methods["balanceOf(address)"](user2);

      user1Balance.toString().should.equal(0n.toString());
      user2Balance
        .toString()
        .should.equal((90_000n * 10n ** DECIMALS).toString());

      eventEmitted(result, "Approval", (event: any) => {
        return (
          event.owner === user1 &&
          event.spender === user2 &&
          event.value.toString() === (100_000n * 10n ** DECIMALS).toString()
        );
      });
    });
    it("should allow maximum uint256", async () => {
      const result = await contract.approve(user2, MAX_UINT256.toString(), {
        from: user1,
      });

      var user1Balance = await contract.methods["balanceOf(address)"](user1);
      var user2Balance = await contract.methods["balanceOf(address)"](user2);

      user1Balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());
      user2Balance.toString().should.equal(0n.toString());

      await contract.transferFrom(
        user1,
        user2,
        (100_000n * 10n ** DECIMALS).toString(),
        { from: user2 }
      );

      var user1Balance = await contract.methods["balanceOf(address)"](user1);
      var user2Balance = await contract.methods["balanceOf(address)"](user2);

      user1Balance.toString().should.equal(0n.toString());
      user2Balance
        .toString()
        .should.equal((90_000n * 10n ** DECIMALS).toString());

      eventEmitted(result, "Approval", (event: any) => {
        return (
          event.owner === user1 &&
          event.spender === user2 &&
          event.value.toString() === MAX_UINT256.toString()
        );
      });
    });
    it("should not transferFrom more than available balance", async () => {
      const result = await contract.approve(user2, MAX_UINT256.toString(), {
        from: user1,
      });

      var user1Balance = await contract.methods["balanceOf(address)"](user1);
      var user2Balance = await contract.methods["balanceOf(address)"](user2);

      user1Balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());
      user2Balance.toString().should.equal(0n.toString());

      await contract
        .transferFrom(
          user1,
          user2,
          (100_000n * 10n ** DECIMALS + 1n).toString(),
          { from: user2 }
        )
        .should.eventually.rejectedWith();
    });
    it("should deduct transferFrom amount from approval", async () => {
      await contract.approve(user2, (100_000n * 10n ** DECIMALS).toString(), {
        from: user1,
      });

      var user1Balance = await contract.methods["balanceOf(address)"](user1);
      var user2Balance = await contract.methods["balanceOf(address)"](user2);

      var allowance = await contract.allowance(user1, user2);

      allowance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString().toString());

      user1Balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());
      user2Balance.toString().should.equal(0n.toString());

      await contract.transferFrom(
        user1,
        user2,
        (50_000n * 10n ** DECIMALS).toString(),
        { from: user2 }
      );

      var allowance = await contract.allowance(user1, user2);

      allowance
        .toString()
        .should.equal((50_000n * 10n ** DECIMALS).toString().toString());
    });
    it("should transferFrom smallest unit", async () => {
      const result = await contract.approve(user2, 1n.toString(), {
        from: user1,
      });

      var user1Balance = await contract.methods["balanceOf(address)"](user1);
      var user2Balance = await contract.methods["balanceOf(address)"](user2);

      user1Balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS).toString());
      user2Balance.toString().should.equal(0n.toString());

      var allowance = await contract.allowance(user1, user2);

      allowance.toString().should.equal(1n.toString());

      await contract.transferFrom(user1, user2, 1n.toString(), { from: user2 });

      var allowance = await contract.allowance(user1, user2);

      allowance.toString().should.equal(0n.toString());

      var user1Balance = await contract.methods["balanceOf(address)"](user1);
      var user2Balance = await contract.methods["balanceOf(address)"](user2);

      user1Balance
        .toString()
        .should.equal((100_000n * 10n ** DECIMALS - 1n).toString());
      user2Balance.toString().should.equal(1n.toString());

      eventEmitted(result, "Approval", (event: any) => {
        return (
          event.owner === user1 &&
          event.spender === user2 &&
          event.value.toString() === 1n.toString()
        );
      });
    });
    it("should set approve tokens absolutely rather than adding to the approval", async () => {
      await contract.approve(user2, 1n.toString(), {
        from: user1,
      });

      var allowance = await contract.allowance(user1, user2);

      allowance.toString().should.equal(1n.toString());

      await contract.approve(user2, 2n.toString(), {
        from: user1,
      });

      var allowance = await contract.allowance(user1, user2);

      allowance.toString().should.equal(2n.toString());
    });
  });

  describe("NFT integration", () => {
    beforeEach(async () => {
      await erc20.approve(
        contract.address,
        (400_000_000_000n * 10n ** DECIMALS).toString(),
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

      await contract.mint(
        0n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );

      await contract.mint(
        1n.toString(),
        (100_000n * 10n ** DECIMALS).toString(),
        {
          from: user1,
        }
      );
    });

    it("should represent balance of token in batch", async () => {
      var bonds: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds.push(bond);
      }

      const balances = await contract.balanceOfBatch(
        bonds.map((b) => user1),
        bonds.map((b) => b.token.toString())
      );
      balances.length.should.equal(bonds.length);
      for (const i in bonds) {
        balances[i].toString().should.equal(bonds[i].balance.toString());
      }
    });

    it("should allow safe transfers", async () => {
      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      await contract.safeTransferFrom(
        user1,
        user2,
        bonds1[0].token.toString(),
        50n.toString(),
        "0x",
        { from: user1 }
      );

      var bonds2: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds2.push(bond);
      }

      bonds2.length.should.equal(1);
      bonds2[0].balance.toString().should.equal(45n.toString());
      bonds2[0].token.toString().should.not.equal(bonds1[0].token.toString());
      bonds2[0].id.toString().should.not.equal(bonds1[0].id.toString());
      bonds2[0].bondType.toString().should.equal(bonds1[0].bondType.toString());
    });
    it("should prevent safe transfers to non-conformant contract", async () => {
      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      await contract
        .safeTransferFrom(
          user1,
          erc20.address,
          bonds1[0].token.toString(),
          50n.toString(),
          "0x",
          { from: user1 }
        )
        .should.eventually.rejectedWith();
    });
    it("should do safe batch transfers", async () => {
      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      await contract.safeBatchTransferFrom(
        user1,
        user2,
        bonds1.map((bond) => bond.token.toString()),
        bonds1.map((bond) => 50n.toString()),
        "0x",
        { from: user1 }
      );

      var bonds2: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds2.push(bond);
      }

      bonds2.length.should.equal(bonds1.length);

      for (const i in bonds1) {
        const bond1 = bonds1[i];
        const bond2 = bonds2.find(
          (bond) => bond.bondType.toString() === bond1.bondType.toString()
        )!;

        bond2.token.toString().should.not.equal(bond1.token.toString());
        bond2.id.toString().should.not.equal(bond1.id.toString());
        bond2.bondType.toString().should.equal(bond1.bondType.toString());
        bond2.balance.toString().should.equal(45n.toString());
      }
    });
    it("should approve maximum ERC20 when doing approvals", async () => {
      await contract.setApprovalForAll(user2, true, { from: user1 });

      const allowance = await contract.allowance(user1, user2);

      allowance.toString().should.equal(MAX_UINT256.toString());
    });
    it("should not safeTransferFrom more than available balance", async () => {
      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      await contract
        .safeTransferFrom(
          user1,
          user2,
          bonds1[0].token.toString(),
          (BigInt(bonds1[0].balance.toString()) + 1n).toString(),
          "0x",
          { from: user1 }
        )
        .should.eventually.rejectedWith();
    });
    it("should emit events from transfer", async () => {
      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      const result = await contract.safeTransferFrom(
        user1,
        user2,
        bonds1[0].token.toString(),
        bonds1[0].balance.toString(),
        "0x",
        { from: user1 }
      );

      var bonds2: Bond[] = [];
      for await (const bond of iterateBonds(user2)) {
        bonds2.push(bond);
      }

      eventEmitted(result, "TransferSingle", (event: any) => {
        return (
          event.operator == user1 &&
          event.from === user1 &&
          event.to === ZERO_ADDRESS &&
          event.id.toString() === bonds1[0].token.toString() &&
          event.value.toString() === bonds2[0].balance.toString()
        );
      });

      eventEmitted(result, "TransferSingle", (event: any) => {
        return (
          event.operator == user1 &&
          event.from === ZERO_ADDRESS &&
          event.to === user2 &&
          event.id.toString() === bonds2[0].token.toString() &&
          event.value.toString() === bonds2[0].balance.toString()
        );
      });
    });
    it("should concatenate the url correctly", async () => {
      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      const uri = await contract.uri(bonds1[0].token.toString());
      uri.should.equal(config.baseURI + "0x" + bonds1[0].token.toString(16));
    });

    it("get bond from token", async () => {
      var bonds1: Bond[] = [];
      for await (const bond of iterateBonds(user1)) {
        bonds1.push(bond);
      }

      const bondToken = (await contract.bondTokens(
        bonds1[0].token.toString()
      )) as any as BondTokenPtr;

      bondToken.bond.toString().should.equal(bonds1[0].id.toString());
      bondToken.owner.toString().should.equal(bonds1[0].owner.toString());
    });
  });

  describe("ERC165 implementation", () => {
    it("should support ERC20", async () => {
      const supportsInterface = await contract.supportsInterface("0x36372b07");
      supportsInterface.should.be.true;
    });
    it("should support ERC20Metadata", async () => {
      const supportsInterface = await contract.supportsInterface("0xa219a025");
      supportsInterface.should.be.true;
    });
    it("should support ERC1155", async () => {
      const supportsInterface = await contract.supportsInterface("0xd9b67a26");
      supportsInterface.should.be.true;
    });
    it("should support ERC1155MetadataURI", async () => {
      const supportsInterface = await contract.supportsInterface("0x0e89341c");
      supportsInterface.should.be.true;
    });
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

    it("should allow transfer out of other ERC20 tokens to deposit account", async () => {
      const token2 = await ERC20Token.new("TEST", "TEST", { from: deployer });
      await token2.mint((100_000n * 10n ** DECIMALS).toString(), {
        from: user1,
      });
      await token2.transfer(
        contract.address,
        (100_000n * 10n ** DECIMALS).toString(),
        { from: user1 }
      );

      await contract.recoverERC20(token2.address, { from: deployer });

      const balance = await token2.balanceOf(wisdom);

      balance.toString().should.equal((100_000n * 10n ** DECIMALS).toString());
    });
  });
});
