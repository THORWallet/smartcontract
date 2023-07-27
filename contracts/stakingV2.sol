// SPDX-License-Identifier: MIT

// combined from
// https://github.com/Thorstarter/thorstarter-contracts/blob/main/contracts/Staking.sol
// and:
// https://github.com/goosedefi/goose-contracts/blob/master/contracts/MasterChefV2.sol
// which was audited

pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

contract StakingV2 is Ownable, Multicall, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Info of each Staking user.
    /// `amount` LP token amount the user has provided.
    /// `rewardOffset` The amount of token which needs to be subtracted at the next harvesting event.
    struct UserInfo {
        uint256 amount;
        mapping(address rewardToken => uint256) rewardDebt;
    }

    /// @notice Info of Staking pool.
    /// `lpToken` The address of LP token contract.
    /// `allocPoint` The amount of allocation points assigned to the pool.
    /// Also known as the amount of token to distribute per block.
    IERC20 public lpToken;
    uint256 public lastRewardBlock;
    uint256 public allocPoint;

    struct RewardInfo {
        IERC20 rewardToken;
        address rewardOwner;
        uint256 rewardPerBlock;
        uint256 accRewardPerShare;
    }

    // The amount of rewardTokens entitled to a user but is pending to be distributed is:
    //
    //   pending reward = (user.amount * pool.accRewardPerShare) - user.rewardOffset
    //
    // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
    //   1. The pool's `accRewardPerShare` (and `lastRewardBlock`) gets updated.
    //   2. User receives the pending reward sent to his/her address.
    //   3. User's `amount` gets updated.
    //   4. User's `rewardOffset` gets updated.

    // @notice Info of each reward token.
    RewardInfo[] public rewards;

    /// @notice Info of each user that stakes LP tokens.
    mapping(address account => UserInfo) public userInfo;
    /// @dev Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;

    uint256 private constant ACC_PRECISION = 1e12;

    event Deposit(address indexed user, uint256 amount, address indexed to);
    event Withdraw(address indexed user, uint256 amount, address indexed to);
    event EmergencyWithdraw(address indexed user, uint256 amount, address indexed to);
    event Harvest(address indexed user, address indexed rewardToken, uint256 amount);
    event LogPoolAddition(uint256 allocPoint, IERC20 indexed lpToken);
    event LogSetPool(uint256 allocPoint);
    event LogUpdatePool(uint256 lastRewardBlock, uint256 lpSupply, uint256 accRewardPerShare);

    /// @param _rewardTokens The reward token contract address which will be distributed with rewardOwner and rewardPerBlock.
    constructor(RewardInfo[] memory _rewardTokens) Ownable() {
        for (uint256 i = 0; i < _rewardTokens.length; i++) {
            rewards.push(_rewardTokens[i]);
        }
    }

    /// @notice Sets the reward token.
    function setRewardInfo(RewardInfo memory _rewardInfo) public onlyOwner {
        for (uint256 i = 0; i < rewards.length; i++) {
            if (rewards[i].rewardToken == _rewardInfo.rewardToken) {
                rewards[i] = _rewardInfo;
            }
        }
    }

    /// @notice Add a new LP to the pool. Can only be called by the owner.
    /// DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    /// @param _allocPoint AP of the new pool.
    /// @param _lpToken Address of the LP ERC-20 token.
    function setPool(uint256 _allocPoint, IERC20 _lpToken) public onlyOwner {
        totalAllocPoint = totalAllocPoint + _allocPoint;
        lpToken = _lpToken;
        allocPoint = _allocPoint;
        lastRewardBlock = block.number;

        emit LogPoolAddition(_allocPoint, _lpToken);
    }

    /// @notice Update the given pool's token allocation point. Can only be called by the owner.
    /// @param _allocPoint New AP of the pool.
    function set(uint256 _allocPoint) public onlyOwner {
        totalAllocPoint = totalAllocPoint - allocPoint + _allocPoint;
        allocPoint = _allocPoint;

        emit LogSetPool(_allocPoint);
    }

    /// @notice View function to see pending token reward on frontend.
    /// @param _user Address of user.
    /// @return pending token reward for a given user.
    function pendingRewards(address _user, address _rewardToken) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        RewardInfo memory rewardInfo;
        for (uint256 i = 0; i < rewards.length; i++) {
            if (address(rewards[i].rewardToken) == _rewardToken) {
                rewardInfo = rewards[i];
            }
        }
        uint256 lpSupply = lpToken.balanceOf(address(this));
        if (block.number > lastRewardBlock && lpSupply != 0) {
            uint256 blocks = block.number - lastRewardBlock;
            uint256 reward = (blocks * rewardInfo.rewardPerBlock * allocPoint) / totalAllocPoint;
            rewardInfo.accRewardPerShare = rewardInfo.accRewardPerShare + ((reward * ACC_PRECISION) / lpSupply);
        }
        uint256 accumulatedReward = (user.amount * rewardInfo.accRewardPerShare) / ACC_PRECISION;
        return accumulatedReward - user.rewardDebt[_rewardToken];
    }

    /// @notice Update reward variables of the given pool.
    function updatePool() public {
        console.log("updatePool");
        console.log("block.number", block.number);
        console.log("lastRewardBlock", lastRewardBlock);
        if (block.number <= lastRewardBlock) {
            return;
        }
        uint256 lpSupply = lpToken.balanceOf(address(this));
        if (lpSupply == 0 || allocPoint == 0) {
            lastRewardBlock = block.number;
            return;
        }
        for (uint256 i = 0; i < rewards.length; i++) {
            RewardInfo storage rewardInfo = rewards[i];
            uint256 blocks = block.number - lastRewardBlock;
            uint256 reward = (blocks * rewardInfo.rewardPerBlock * allocPoint) / totalAllocPoint;
            rewardInfo.accRewardPerShare = rewardInfo.accRewardPerShare + ((reward * ACC_PRECISION) / lpSupply);
            lastRewardBlock = block.number;
            console.log("LogUpdatePool", lastRewardBlock, lpSupply, rewardInfo.accRewardPerShare);
            emit LogUpdatePool(lastRewardBlock, lpSupply, rewardInfo.accRewardPerShare);
        }
    }

    /// @notice Deposit LP tokens to Staking for reward token allocation.
    /// @param amount LP token amount to deposit.
    /// @param to The receiver of `amount` deposit benefit.
    function deposit(uint256 amount, address to) public nonReentrant {
        updatePool();
        UserInfo storage user = userInfo[msg.sender];
        for (uint256 i = 0; i < rewards.length; i++) {
            IERC20 rewardToken = rewards[i].rewardToken;
            // harvest
            uint256 accumulatedReward = (user.amount * rewards[i].accRewardPerShare) / ACC_PRECISION;
            uint256 pendingReward = accumulatedReward - user.rewardDebt[address(rewardToken)];

            if (pendingReward > 0) {
                rewardToken.safeTransferFrom(rewards[i].rewardOwner, to, pendingReward);
            }

            user.rewardDebt[address(rewardToken)] = (user.amount * rewards[i].accRewardPerShare) / ACC_PRECISION;
        }

        if (amount > 0) {
            lpToken.safeTransferFrom(address(msg.sender), address(this), amount);
            user.amount = user.amount + amount;
        }

        emit Deposit(msg.sender, amount, to);
    }

    /// @notice Withdraw LP tokens from Staking.
    /// @param amount LP token amount to withdraw.
    /// @param to Receiver of the LP tokens.
    function withdraw(uint256 amount, address to) public nonReentrant {
        updatePool();
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= amount, "withdraw: not good");
        for (uint256 i = 0; i < rewards.length; i++) {
            IERC20 rewardToken = rewards[i].rewardToken;
            // harvest
            uint256 accumulatedReward = (user.amount * rewards[i].accRewardPerShare) / ACC_PRECISION;
            uint256 pendingReward = accumulatedReward - user.rewardDebt[address(rewardToken)];
            if (pendingReward > 0) {
                rewardToken.safeTransferFrom(rewards[i].rewardOwner, to, pendingReward);
            }

            user.rewardDebt[address(rewardToken)] = (user.amount * rewards[i].accRewardPerShare) / ACC_PRECISION;
        }

        if (amount > 0) {
            user.amount = user.amount - amount;
            lpToken.safeTransfer(to, amount);
        }

        emit Withdraw(msg.sender, amount, to);
    }

    /// @notice Harvest proceeds for transaction sender to `to`.
    /// @param to Receiver of token rewards.
    function harvest(address to) public {
        updatePool();
        UserInfo storage user = userInfo[msg.sender];
        for (uint256 i = 0; i < rewards.length; i++) {
            IERC20 rewardToken = rewards[i].rewardToken;
            console.log("rewardToken: %s", address(rewardToken));
            console.log("user.amount: %s", user.amount);
            console.log("rewards[i].accRewardPerShare: %s", rewards[i].accRewardPerShare);
            uint256 accumulatedReward = (user.amount * rewards[i].accRewardPerShare) / ACC_PRECISION;
            uint256 pendingReward = accumulatedReward - user.rewardDebt[address(rewardToken)];
            user.rewardDebt[address(rewardToken)] = accumulatedReward;
            console.log("pendingReward: %s", pendingReward);
            if (pendingReward > 0) {
                rewardToken.safeTransferFrom(rewards[i].rewardOwner, to, pendingReward);
            }
            emit Harvest(msg.sender, address(rewardToken), pendingReward);
        }
    }

    /// @notice Withdraw without caring about rewards. EMERGENCY ONLY.
    /// @param to Receiver of the LP tokens.
    function emergencyWithdraw(address to) public {
        UserInfo storage user = userInfo[msg.sender];

        uint256 amount = user.amount;

        user.amount = 0;
        for (uint256 i = 0; i < rewards.length; i++) {
            user.rewardDebt[address(rewards[i].rewardToken)] = 0;
        }
        lpToken.safeTransfer(to, amount);
        emit EmergencyWithdraw(msg.sender, amount, to);
    }

}
