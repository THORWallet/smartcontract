# TGT Contracts

The contract is an ERC20 contract with the following additions:

* [ERC20 Permit](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/draft-IERC20Permit.sol)
  in combination with [EIP712](https://eips.ethereum.org/EIPS/eip-712). The wallet user can give a permit to an otherone
  to operate on the token. Obviously, ECDSA from OpenZeppelin is used, which also includes
  my [signature malleability](https://github.com/OpenZeppelin/openzeppelin-contracts/pull/1622) fix.
* ERC677 with an addition to call contracts if an approval was given. Thus, this contract provides the following two
  functions. In combination with the ERC20 permit, a wallet user does not need to have Ethers to transfer tokens. The
  user can provide a permit, that the wallet operator can approve, and the wallet operator can then call on behalf of
  the user e.g., the staking contract.
    * transferAndCall(address to, uint value, bytes calldata data)
    * transferFromAndCall(address sender, address to, uint value, bytes calldata data)

## Token Emit

The token emitting function can be found in [supply-curve.ods](supply-curve.ods). It first emits fast, then get slower
until it reaches the max of 1b tokens. The emitting is done every month within an ERC20 transfer. Every year the amount
of tokens that can be emitted is lowered according to the emitting function.

## Facts

* Max Supply: 1b
* Init Supply: 460m
* Decimals: 18
* Symbol: TGT
* Token Name: THORWallet Governance Token
* Vesting for investors and team, with cliff and linear release of tokens

## Installation and Running Tests

Run the following commands on the freshly cloned repository:

```
npm install
npm test
```

Testing is wip...
