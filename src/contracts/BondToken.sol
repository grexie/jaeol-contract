/*
 * SPDX-License-Identifier: MIT
 */

pragma solidity ^0.8.17;
pragma experimental ABIEncoderV2;

import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC1155/IERC1155.sol';
import '@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol';
import '@openzeppelin/contracts/token/ERC1155/utils/ERC1155Receiver.sol';
import { LinkedList } from './LinkedList.sol';
import { Signable } from '@grexie/signable/contracts/Signable.sol';

contract BondToken is
  Ownable,
  ERC165,
  IERC20Metadata,
  IERC1155,
  IERC1155MetadataURI,
  Signable
{
  using LinkedList for LinkedList.List;
  using Address for address;
  using Strings for uint256;

  IERC20Metadata private _usdt;

  string public override(IERC20Metadata) name;
  string public override(IERC20Metadata) symbol;

  mapping(address => bool) public adminPaused;

  address public signer;

  struct Config {
    address usdt;
    address depositAccount;
    uint256 transferFee100;
    uint256 minDeposit;
    uint256 minWithdraw;
    string baseURI;
    uint256 supplyCap;
    uint256 earlyMaturation;
    uint256 maxAffiliateMultipliers;
    uint256 minAffiliateBondAmount100;
    uint256 affiliateMultiplier100;
  }

  Config public config;

  struct BondUI {
    bool visible;
    string style;
    string[] color;
    string name;
    string description;
  }

  struct BondType {
    uint256 id;
    bool enabled;
    uint256 amount;
    uint256 multiplier100;
    uint256 matureDuration;
    BondUI ui;
  }

  struct Bond {
    uint256 id;
    uint256 token;
    uint256 bondType;
    address owner;
    uint256 balance;
    uint256 matures;
    uint256 multiplier100;
    uint8 affiliateMultipliers;
  }

  struct BondTokenPtr {
    address owner;
    uint256 bond;
  }

  struct BondForgeRequirement {
    uint256 bondType;
    uint256 count;
    uint256 balance;
    uint256 multiplier100;
  }

  struct BondForgeResult {
    uint256 bondType;
    uint256 multiplier100;
    uint256 matureDuration;
  }

  struct BondForge {
    uint256 id;
    bool enabled;
    BondForgeRequirement[] requirements;
    BondForgeResult result;
    string name;
    string description;
  }

  struct BondAffiliate {
    address account;
    uint256 bond;
  }

  uint256 public totalSupply;

  mapping(address => LinkedList.List) public accountBonds;
  mapping(address => uint256) public balances;
  mapping(address => mapping(uint256 => Bond)) public bonds;
  mapping(address => uint256) public nextBond;
  mapping(uint256 => BondTokenPtr) public bondTokens;

  // owner => bondType => multiplier100 => LinkedList of bonds
  mapping(address => mapping(uint256 => mapping(uint256 => LinkedList.List)))
    public bondsByBondType;

  mapping(uint256 => BondType) public bondTypes;
  uint256 public nextBondType;

  mapping(uint256 => BondForge) public bondForges;
  uint256 public nextBondForge;

  mapping(address => mapping(address => uint256)) public allowances;

  event ConfigChanged(Config from, Config to);
  event TransferFee(address indexed account, uint256 amount);
  event AccountPaused(address indexed account);
  event AccountResumed(address indexed account);
  event AdminPaused(address indexed account);
  event AdminResumed(address indexed account);
  event AddedBondType(BondType bondType);
  event ChangedBondType(BondType from, BondType to);
  event AddedBondForge(BondForge bondForge);
  event ChangedBondForge(BondForge from, BondForge to);

  constructor(
    string memory name_,
    string memory symbol_,
    Config memory config_
  ) {
    name = name_;
    symbol = symbol_;
    _usdt = IERC20Metadata(config_.usdt);
    config = config_;
  }

  function setSigner(address signer_) external onlyOwner {
    signer = signer_;
  }

  function setConfig(Config calldata config_) external onlyOwner {
    emit ConfigChanged(config, config_);
    config = config_;
    _usdt = IERC20Metadata(config_.usdt);
  }

  function addBondType(
    BondType calldata bondType_
  ) external onlyOwner returns (uint256) {
    emit AddedBondType(bondType_);
    uint256 id = nextBondType++;
    bondTypes[id] = bondType_;
    bondTypes[id].id = id;
    return id;
  }

  function updateBondType(
    BondType calldata bondType
  ) external onlyOwner returns (bool) {
    emit ChangedBondType(bondTypes[bondType.id], bondType);
    bondTypes[bondType.id] = bondType;
    return true;
  }

  function addBondForge(
    BondForge calldata bondForge_
  ) external onlyOwner returns (uint256) {
    emit AddedBondForge(bondForge_);
    uint256 id = nextBondForge++;
    bondForges[id] = bondForge_;
    bondForges[id].id = id;
    return id;
  }

  function updateBondForge(
    BondForge calldata bondForge_
  ) external onlyOwner returns (bool) {
    emit ChangedBondForge(bondForges[bondForge_.id], bondForge_);
    bondForges[bondForge_.id] = bondForge_;
    return true;
  }

  function usdt() public view returns (address) {
    return address(_usdt);
  }

  function decimals() external view returns (uint8) {
    return _usdt.decimals();
  }

  function uri(uint256 id) external view returns (string memory) {
    return string.concat(config.baseURI, id.toHexString(32));
  }

  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override(ERC165, IERC165) returns (bool) {
    return
      interfaceId == type(IERC20).interfaceId ||
      interfaceId == type(IERC20Metadata).interfaceId ||
      interfaceId == type(IERC1155).interfaceId ||
      interfaceId == type(IERC1155MetadataURI).interfaceId ||
      super.supportsInterface(interfaceId);
  }

  function balanceOf(
    address account
  ) external view override(IERC20) returns (uint256) {
    return balances[account];
  }

  function balanceOf(
    address account,
    uint256 bondID
  ) external view returns (uint256) {
    require(bonds[account][bondID].owner == account);

    return bonds[account][bondID].balance;
  }

  // TODO: ERC1155???
  function balanceOfBatch(
    address[] calldata accounts,
    uint256[] calldata ids
  ) external view returns (uint256[] memory) {
    require(accounts.length == ids.length);

    uint256[] memory batchBalances = new uint256[](accounts.length);

    for (uint256 i = 0; i < accounts.length; ++i) {
      batchBalances[i] = this.balanceOf(accounts[i], ids[i]);
    }

    return batchBalances;
  }

  // function getLastAccountBond(
  //   address account
  // ) public view returns (bool, uint256) {
  //   (bool exists, , uint256 next) = accountBonds[account].getNode(0);
  //   return (exists, next);
  // }

  function bondHead(
    address account
  ) public view returns (bool exists, uint256 bond) {
    return (
      accountBonds[account].list[accountBonds[account].head].exists,
      accountBonds[account].head
    );
  }

  function bondNext(
    address account,
    uint256 id
  ) public view returns (bool exists, uint256 bond) {
    return accountBonds[account].next(id);
  }

  function _creditBond(
    address account,
    uint256 bondType,
    uint256 amount,
    bool transferFee,
    uint256 multiplier100,
    uint256 matures
  ) internal returns (bool, uint256, uint256) {
    require(amount > 0);

    mapping(uint256 => Bond) storage _bonds = bonds[account];

    if (multiplier100 == 0) {
      multiplier100 = bondTypes[bondType].multiplier100;
    }
    if (matures == 0) {
      matures = block.timestamp + bondTypes[bondType].matureDuration;
    }

    uint256 id;
    uint256 tokenId;

    LinkedList.List storage list = bondsByBondType[account][bondType][
      multiplier100
    ];

    Bond storage bond_ = _bonds[list.head];

    if (
      list.list[list.head].exists &&
      (int256(bond_.matures) - int256(matures) < 7 * 24 * 3600 ||
        int256(matures) - int256(bond_.matures) < 7 * 24 * 3600)
    ) {
      id = list.head;
      tokenId = _bonds[id].token;

      if (bond_.matures > matures) {
        bond_.matures = matures;
      }
    } else {
      (, id, tokenId) = _creditBondSetBondParams(
        account,
        bondType,
        amount,
        transferFee,
        multiplier100,
        matures
      );
    }

    if (transferFee) {
      uint256 fee = (amount * config.transferFee100) / (100 * 100);
      amount -= fee;

      emit TransferFee(account, fee);
    }

    _creditBondSetBalances(account, id, amount);

    return (true, id, tokenId);
  }

  function _creditBondSetBalances(
    address account,
    uint256 bond,
    uint256 amount
  ) internal returns (bool) {
    bonds[account][bond].balance += amount;
    balances[account] += amount;
    return true;
  }

  function _creditBondSetBondParams(
    address account,
    uint256 bondType,
    uint256, //amount,
    bool, //transferFee,
    uint256 multiplier100,
    uint256 matures
  ) internal returns (bool, uint256, uint256) {
    uint256 id = nextBond[account]++;
    uint256 tokenId = uint256(
      keccak256(abi.encodePacked(account, id, block.timestamp))
    );

    bondTokens[tokenId].owner = account;
    bondTokens[tokenId].bond = id;

    Bond storage bond__ = bonds[account][id];
    bond__.id = id;
    bond__.token = tokenId;
    bond__.bondType = bondType;
    bond__.owner = account;
    bond__.multiplier100 = multiplier100;
    bond__.matures = matures;

    bondsByBondType[account][bondType][multiplier100].unshift(id);
    accountBonds[account].unshift(id);

    return (true, id, tokenId);
  }

  function _debitBond(
    address account,
    uint256 bond,
    uint256 amount
  ) internal returns (bool) {
    require(amount > 0);
    require(bonds[account][bond].balance >= amount);

    bonds[account][bond].balance -= amount;
    balances[account] -= amount;

    if (bonds[account][bond].balance == 0) {
      accountBonds[account].remove(bond);
      bondsByBondType[account][bonds[account][bond].bondType][
        bonds[account][bond].multiplier100
      ].remove(bond);
    }

    return true;
  }

  function allowance(
    address owner,
    address spender
  ) external view returns (uint256) {
    return allowances[owner][spender];
  }

  function approve(address spender, uint256 amount) external returns (bool) {
    allowances[msg.sender][spender] = amount;
    emit Approval(msg.sender, spender, amount);

    return true;
  }

  function setApprovalForAll(address operator, bool approved) external {
    uint256 value = 0;
    if (approved) {
      value = type(uint256).max;
    }
    allowances[msg.sender][operator] = value;

    emit Approval(msg.sender, operator, value);
    emit ApprovalForAll(msg.sender, operator, approved);
  }

  function isApprovedForAll(
    address account,
    address operator
  ) external view returns (bool) {
    // TODO: should this be balanceOf checking max uint256?
    return allowances[msg.sender][operator] >= this.balanceOf(account);
  }

  function transfer(address to, uint256 amount) external returns (bool) {
    return _transferFrom(msg.sender, to, amount);
  }

  function transferFrom(
    address from,
    address to,
    uint256 amount
  ) external returns (bool) {
    require(to == _msgSender());
    require(allowances[from][to] >= amount);
    bool success = _transferFrom(from, to, amount);

    return success;
  }

  function safeTransferFrom(
    address from,
    address to,
    uint256 id,
    uint256 amount,
    bytes calldata data
  ) external {
    require(
      from == _msgSender() || this.isApprovedForAll(from, _msgSender()),
      '07'
    );
    require(bondTokens[id].owner == from);

    _transferBondFrom(bondTokens[id].bond, from, to, amount);

    emit TransferSingle(_msgSender(), from, to, id, amount);

    _doSafeTransferAcceptanceCheck(_msgSender(), from, to, id, amount, data);
  }

  function safeBatchTransferFrom(
    address from,
    address to,
    uint256[] calldata ids,
    uint256[] calldata amounts,
    bytes calldata data
  ) external {
    address operator = _msgSender();
    require(from == operator || this.isApprovedForAll(from, operator));
    require(ids.length == amounts.length);

    for (uint256 i = 0; i < ids.length; i++) {
      require(bondTokens[ids[i]].owner == from);
      _transferBondFrom(bondTokens[ids[i]].bond, from, to, amounts[i]);
    }

    emit TransferBatch(operator, from, to, ids, amounts);

    _doSafeBatchTransferAcceptanceCheck(operator, from, to, ids, amounts, data);
  }

  function _transferFrom(
    address from,
    address to,
    uint256 amount
  ) internal returns (bool) {
    while (amount > 0) {
      uint256 bond = accountBonds[from].head;
      require(accountBonds[from].list[accountBonds[from].head].exists);

      uint256 transferred;
      if (amount > bonds[from][bond].balance) {
        transferred = bonds[from][bond].balance;
      } else {
        transferred = amount;
      }
      amount -= transferred;

      if (!_transferBondFrom(bond, from, to, transferred)) {
        revert('04');
      }

      emit TransferSingle(
        _msgSender(),
        from,
        to,
        bonds[from][bond].token,
        amount
      );
    }

    return true;
  }

  function _transferBondFrom(
    uint256 bond,
    address from,
    address to,
    uint256 amount
  ) internal returns (bool) {
    require(to != address(0));
    require(bonds[from][bond].owner == from);

    _debitBond(from, bond, amount);
    _creditBond(
      to,
      bonds[from][bond].bondType,
      amount,
      true,
      bonds[from][bond].multiplier100,
      bonds[from][bond].matures
    );

    emit Transfer(from, to, amount);

    return true;
  }

  function _doSafeTransferAcceptanceCheck(
    address operator,
    address from,
    address to,
    uint256 id,
    uint256 amount,
    bytes memory data
  ) private {
    if (to.isContract()) {
      try
        IERC1155Receiver(to).onERC1155Received(operator, from, id, amount, data)
      returns (bytes4 response) {
        if (response != IERC1155Receiver.onERC1155Received.selector) {
          revert('10');
        }
      } catch Error(string memory reason) {
        revert(reason);
      } catch {
        revert('11');
      }
    }
  }

  function _doSafeBatchTransferAcceptanceCheck(
    address operator,
    address from,
    address to,
    uint256[] memory ids,
    uint256[] memory amounts,
    bytes memory data
  ) private {
    if (to.isContract()) {
      try
        IERC1155Receiver(to).onERC1155BatchReceived(
          operator,
          from,
          ids,
          amounts,
          data
        )
      returns (bytes4 response) {
        if (response != IERC1155Receiver.onERC1155BatchReceived.selector) {
          revert('12');
        }
      } catch Error(string memory reason) {
        revert(reason);
      } catch {
        revert('13');
      }
    }
  }

  function mintAffiliate(
    uint256 bondType,
    uint256 amount,
    BondAffiliate calldata affiliate
  ) external returns (bool) {
    require(affiliate.account != address(0));

    if (
      (bonds[affiliate.account][affiliate.bond].balance *
        config.minAffiliateBondAmount100) /
        100 <=
      amount
    ) {
      if (
        bonds[affiliate.account][affiliate.bond].affiliateMultipliers <
        config.maxAffiliateMultipliers
      ) {
        bonds[affiliate.account][affiliate.bond].affiliateMultipliers++;
        bonds[affiliate.account][affiliate.bond].multiplier100 += config
          .affiliateMultiplier100;
      }
    }

    return _mint(bondType, amount);
  }

  function mint(uint256 bondType, uint256 amount) external returns (bool) {
    return _mint(bondType, amount);
  }

  function _mint(uint256 bondType, uint256 amount) internal returns (bool) {
    require(bondTypes[bondType].enabled);
    require(bondTypes[bondType].amount <= amount);
    require(amount <= _usdt.allowance(_msgSender(), address(this)));
    require(totalSupply + amount <= config.supplyCap);

    if (!_usdt.transferFrom(msg.sender, address(this), amount)) {
      revert('18');
    }

    if (!_usdt.transfer(config.depositAccount, amount)) {
      revert('19');
    }

    address to = _msgSender();

    (, , uint256 tokenId) = _creditBond(to, bondType, amount, false, 0, 0);

    totalSupply += amount;

    emit Transfer(address(0), _msgSender(), amount);
    emit TransferSingle(_msgSender(), address(0), to, tokenId, amount);

    return true;
  }

  function burn(uint256 bond, uint256 amount) external returns (bool) {
    address from = msg.sender;
    require(bonds[from][bond].owner == msg.sender);
    require(bonds[from][bond].balance > 0);
    require(bonds[from][bond].balance > amount);
    require(
      bonds[from][bond].matures < block.timestamp ||
        bonds[from][bond].matures < config.earlyMaturation,
      '1D'
    );
    require(
      _usdt.balanceOf(address(this)) >=
        (amount * bonds[from][bond].multiplier100) / 100,
      '1E'
    );

    _debitBond(_msgSender(), bond, amount);

    if (
      !_usdt.transfer(
        msg.sender,
        (amount * bonds[from][bond].multiplier100) / 100
      )
    ) {
      revert('1F');
    }

    totalSupply -= amount;

    emit Transfer(from, address(0), amount);
    emit TransferSingle(
      _msgSender(),
      from,
      address(0),
      bonds[from][bond].token,
      amount
    );

    return true;
  }

  function link(
    uint256[] calldata bonds_,
    uint256[] calldata amounts_
  ) external returns (bool) {
    require(bonds_.length == amounts_.length);

    uint256 amount = 0;
    uint256 bondType = bonds[_msgSender()][bonds_[0]].bondType;
    uint256 multiplier100 = type(uint256).max;
    uint256 matures = 0;
    uint256 requirementsMet = 0;

    for (uint256 i = 0; i < bonds_.length; i++) {
      if (bonds[_msgSender()][bonds_[i]].bondType == bondType) {
        requirementsMet++;
      }

      amount += amounts_[i];
      if (bonds[_msgSender()][bonds_[i]].multiplier100 < multiplier100) {
        multiplier100 = bonds[_msgSender()][bonds_[i]].multiplier100;
      }
      if (bonds[_msgSender()][bonds_[i]].matures > matures) {
        matures = bonds[_msgSender()][bonds_[i]].matures;
      }
      _debitBond(_msgSender(), bonds_[i], amounts_[i]);
    }

    require(requirementsMet == bonds_.length);

    _creditBond(_msgSender(), bondType, amount, false, multiplier100, matures);

    return true;
  }

  function split(
    uint256 bond_,
    uint256[] calldata amounts_
  ) external returns (bool) {
    uint256 amount = bonds[_msgSender()][bond_].balance;
    uint256 bondType = bonds[_msgSender()][bond_].bondType;
    uint256 matures = bonds[_msgSender()][bond_].matures;
    uint256 multiplier100 = bonds[_msgSender()][bond_].multiplier100;

    _debitBond(_msgSender(), bond_, amount);

    for (uint256 i = 0; i < amounts_.length; i++) {
      amount -= amounts_[i];
      _creditBond(
        _msgSender(),
        bondType,
        amounts_[i],
        false,
        multiplier100,
        matures
      );
    }

    require(amount == 0);

    return true;
  }

  function forge(
    uint256 forge_,
    uint256[] calldata bonds_,
    uint256[] calldata amounts_
  ) external returns (bool) {
    require(bonds_.length == amounts_.length);
    require(bondForges[forge_].enabled);

    uint256 amount = 0;
    uint256 bondType = bondForges[forge_].result.bondType;
    uint256 multiplier100 = bondForges[forge_].result.multiplier100;
    uint256 matureDuration = bondForges[forge_].result.matureDuration;
    uint256 requirementsMet = 0;

    for (uint256 i = 0; i < bonds_.length; i++) {
      for (uint256 j = 0; j < bondForges[forge_].requirements.length; j++) {
        BondForgeRequirement storage requirement = bondForges[forge_]
          .requirements[j];

        if (
          requirement.bondType == bonds[_msgSender()][bonds_[i]].bondType &&
          bonds[_msgSender()][bonds_[i]].balance >= requirement.balance &&
          bonds[_msgSender()][bonds_[i]].multiplier100 >=
          requirement.multiplier100
        ) {
          if (requirement.count == 0) {
            revert('F2');
          } else {
            requirement.count--;
            if (requirement.count == 0) {
              requirementsMet++;
            }
          }
        }
      }

      amount += amounts_[i];
      if (bonds[_msgSender()][bonds_[i]].multiplier100 > multiplier100) {
        multiplier100 = bonds[_msgSender()][bonds_[i]].multiplier100;
      }
      _debitBond(_msgSender(), bonds_[i], amounts_[i]);
    }

    require(requirementsMet == bondForges[forge_].requirements.length);

    _creditBond(
      _msgSender(),
      bondType,
      amount,
      true,
      multiplier100,
      block.timestamp + matureDuration
    );

    return true;
  }

  function gift(
    address account,
    uint256 bondType,
    uint256 amount,
    uint256 expires,
    Signature calldata signature
  )
    external
    verifySignature(
      abi.encode(this.gift.selector, account, bondType, amount),
      signature
    )
    returns (bool)
  {
    require(expires <= block.timestamp);

    address to = account;

    (, , uint256 tokenId) = _creditBond(to, bondType, amount, false, 0, 0);

    totalSupply += amount;

    emit Transfer(address(0), to, amount);
    emit TransferSingle(_msgSender(), address(0), to, tokenId, amount);

    return true;
  }

  function donate(address sender, uint256 amount) external returns (bool) {
    require(amount >= _usdt.allowance(sender, address(this)));

    if (!_usdt.transferFrom(sender, address(this), amount)) {
      revert('21');
    }

    return true;
  }

  function withdraw(uint256 amount) external onlyOwner returns (bool) {
    if (!_usdt.transfer(config.depositAccount, amount)) {
      revert('22');
    }

    return true;
  }

  receive() external payable {
    revert();
  }

  function recoverERC20(address token_) external onlyOwner returns (bool) {
    uint256 balance;
    IERC20 token__ = IERC20(token_);

    require(token_ != address(_usdt));

    balance = token__.balanceOf(address(this));

    return token__.transfer(config.depositAccount, balance);
  }
}
