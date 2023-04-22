/*
 * SPDX-License-Identifier: MIT
 */

pragma solidity ^0.8.18;
pragma experimental ABIEncoderV2;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract Token is ERC20 {
  constructor(string memory name_, string memory symbol_)
    ERC20(name_, symbol_)
  {}

  function mint(uint256 amount) external virtual {
    require(
      balanceOf(msg.sender) + amount <= 400000000000 * (10**decimals()),
      "don't mint too much on the testnet please"
    );

    _mint(msg.sender, amount);
  }

  function burn(uint256 amount) external virtual {
    _burn(msg.sender, amount);
  }
}
