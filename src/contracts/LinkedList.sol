/*
 * SPDX-License-Identifier: MIT
 */

pragma solidity ^0.8.17;
pragma experimental ABIEncoderV2;

library LinkedList {
  struct Node {
    bool exists;
    uint256 next;
    uint256 previous;
  }

  struct List {
    uint256 size;
    uint256 head;
    mapping(uint256 => Node) list;
  }

  function next(
    List storage self,
    uint256 node
  ) internal view returns (bool, uint256) {
    Node storage _node = self.list[node];
    if (_node.next == node) {
      return (false, _node.next);
    }
    return (self.list[_node.next].exists, _node.next);
  }

  function unshift(List storage self, uint256 node) internal returns (bool) {
    if (self.size == 0) {
      self.head = node;
      self.list[node].exists = true;
    } else {
      self.list[self.head].previous = node;
      self.list[node].next = self.head;
      self.list[node].exists = true;
      self.head = node;
    }
    self.size++;
    return true;
  }

  function remove(List storage self, uint256 node) internal returns (bool) {
    require(self.list[node].exists);

    uint256 nextNode = self.list[node].next;
    uint256 previousNode = self.list[node].previous;

    if (!self.list[previousNode].exists) {
      self.head = nextNode;
    } else {
      self.list[previousNode].next = nextNode;
    }

    if (self.list[nextNode].exists) {
      self.list[nextNode].previous = previousNode;
    }

    delete self.list[node];
    self.size--;

    return true;
  }
}
