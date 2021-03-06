# TGT Contracts

## Audits

* [TGT Contract & Vesting Contract Audit by 21Analytics](audits/THORWallet_audit_report.pdf)
(The findings in the report were resolved and approved by 21Analytics)
* [Staking Contract & Distributor Contract Audit by 21Analytics](audits/THORWallet_Staking_Distributor_audit_report.pdf)
(The findings in the report were resolved and approved by 21Analytics, see [PR #38](https://github.com/THORWallet/smartcontract/pull/38))

## THORWallet Governance Token (TGT) Contract

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
* Contract addresses staking:
  * ~~STAKING_TESTNET_CONTRACT_1 = '0xf1C26043d920fE3459E0BFe9776AC42c448137f1';~~
  * ~~STAKING_TESTNET_CONTRACT_2 = '0xf6e5c60acb61c7ae7f2dde5b4d69889c9c52b387';~~
  * ~~STAKING_MAINNET_CONTRACT = '0x6d6f07425a37b7bb0fae70acd11b6b9314116249';~~
  * STAKING_MAINNET_CONTRACT = '0x77f400a7af20d22F387503dbA3979bA28d8aF48b';
* Contract addresses TGT:
  * TGT_TESTNET_CONTRACT_1 = '0x73d6e26896981798526b6ead48d0fab76e205974';
  * TGT_TESTNET_CONTRACT_2 = '0x108a850856db3f85d0269a2693d896b394c80325';
  * TGT_MAINNET_CONTRACT = '0x108a850856Db3f85d0269a2693D896B394C80325';
* Contract addresses Vesting:
  * VESTING_TESTNET_CONTRACT_1 = '0x303df20dcfda5bc9b6871f5ce783535fecdc1129';
  * VESTING_TESTNET_CONTRACT_2 = '0x68dd83dfaad47fbb804aeb96034220c7a4d28ee5';
  * VESTING_MAINNET_CONTRACT = '0x68dd83dfaad47fbb804aeb96034220c7a4d28ee5';
* Faucet address
  * FAUCET_TESTNET = '0x2dCac0362cF1Ac672BE9496bb9EBb2C00A3b181B'; ()
  * FAUCET_MAINNET = '0x57b0391d98A3c2B338D7025acaC869E96C996903'; (initialized with: 0x108a850856Db3f85d0269a2693D896B394C80325, 0x69102B434be1D245961E7a1114b6e49a2d1283f2, 1000000000000000000)
* live date in TGT contract: 1628165847
* NFT contract: '0x53D917d66EcFec3eF379434b0Ad481E4DdEDcF66'
  * NFT_TESTNET = '0xB7ca508c83defd59eEc051003Ba1A97dDFF36b66'  

## Installation and Running Tests

Run the following commands on the freshly cloned repository:

```
yarn
yarn test
```
