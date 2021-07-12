// SPDX-License-Identifier: MPL

pragma solidity ~0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITGTERC20Metadata is IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function getLive() external view returns (uint64);
}

interface IERC677Receiver {
    function onTokenTransfer(address sender, uint value, bytes calldata data) external;
}

contract Vesting {
    ITGTERC20Metadata private _tgtContract;
    address private _owner;

    mapping(address => VestingParams) private _vesting;

    struct VestingParams {
        //96bit are enough: max value is 1000000000000000000000000000
        //96bit are:                    79228162514264337593543950336
        uint96 vestingAmount;
        //64bit for timestamp in seconds lasts 584 billion years
        uint64 vestingDuration;
        //how much vested funds were already claimed
        uint96 vestingClaimed;
        //the vesting cliff, up to this value, no vesting is required
        uint96 cliff;
    }

    constructor(address tgtContract) {
        _owner = msg.sender;
        _tgtContract = ITGTERC20Metadata(tgtContract);
    }

    function vest(address[] calldata accounts, uint96[] calldata amounts, uint96[] calldata cliffAmounts,
                  uint64[] calldata vestingDurations) public virtual {
        require(_owner == msg.sender, "Vesting: not the owner");
        require(accounts.length == amounts.length, "Vesting: accounts and amounts length must match");
        require(amounts.length == cliffAmounts.length, "Vesting: amounts and cliffAmounts length must match");
        require(cliffAmounts.length == vestingDurations.length, "Vesting: cliffAmounts and vestingDurations length must match");
        require(_tgtContract.getLive() == 0, "Vesting: contract already live");

        for(uint256 i=0;i<accounts.length;i++) {
            _vesting[accounts[i]] = VestingParams(amounts[i] - cliffAmounts[i], vestingDurations[i], 0, cliffAmounts[i]);
        }
    }

    function canClaim(address vested) public view virtual returns (uint256) {
        if(block.timestamp < _tgtContract.getLive()) {
            return 0;
        }
        VestingParams memory v = _vesting[vested];
        if(v.vestingDuration == 0) { //div by 0
            return 0;
        }
        if(_tgtContract.getLive() == 0) {
            //not live yet, only report the cliff
            return v.cliff;
        }
        uint256 timeUnlocked = v.vestingAmount / v.vestingDuration * (block.timestamp - _tgtContract.getLive());
        return (v.cliff + timeUnlocked) - v.vestingClaimed;
    }

    function balanceOf() public view virtual returns (uint256) {
        return _tgtContract.balanceOf(address(this));
    }

    function claim(address to, uint96 amount) public virtual {
        require(block.timestamp >= _tgtContract.getLive(), 'Vesting: timestamp in the past?');
        require(_tgtContract.getLive() != 0, "Vesting: contract not live yet");
        require(to != address(0), "Vesting: transfer from the zero address");
        require(to != address(this), "Vesting: sender is this contract");
        require(to != address(_tgtContract), "Vesting: sender is _tgtContract contract");

        VestingParams storage v = _vesting[msg.sender];
        uint256 timeUnlocked = v.vestingAmount / v.vestingDuration * (block.timestamp - _tgtContract.getLive());

        require(amount <= ((v.cliff + timeUnlocked) - v.vestingClaimed), "TGT: cannot transfer vested funds");

        v.vestingClaimed += amount;
        _tgtContract.transfer(to, amount);
    }
}
