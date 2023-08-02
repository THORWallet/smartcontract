// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
//import "hardhat/console.sol";

/**
 * @title TGT Staking
 * @author ZK Finance
 * @notice TGTStaking is a contract that allows TGT deposits and receives stablecoins sent by MoneyMaker's daily
 * harvests. Users deposit TGT and receive a share of what has been sent by MoneyMaker based on their participation of
 * the total deposited TGT. It is similar to a MasterChef, but we allow for claiming of different reward tokens
 * (in case at some point we wish to change the stablecoin rewarded).
 * Every time `updateReward(token)` is called, We distribute the balance of that tokens as rewards to users that are
 * currently staking inside this contract, and they can claim it using `withdraw(0)`
 */
contract TGTStaking is Ownable {
    using SafeERC20 for IERC20;

    /// @notice Info of each user
    struct UserInfo {
        uint256 amount;
        uint256 depositTimestamp;
        mapping(IERC20 => uint256) rewardDebt;
        /**
         * @notice We do some fancy math here. Basically, any point in time, the amount of TGTs
         * entitled to a user but is pending to be distributed is:
         *
         *   pending reward = (user.amount * accRewardPerShare) - user.rewardDebt[token]
         *
         * Whenever a user deposits or withdraws TGT. Here's what happens:
         *   1. accRewardPerShare (and `lastRewardBalance`) gets updated
         *   2. User receives the pending reward sent to his/her address
         *   3. User's `amount` gets updated
         *   4. User's `rewardDebt[token]` gets updated
         */
    }

    IERC20 public tgt;

    /// @dev Internal balance of TGT, this gets updated on user deposits / withdrawals
    /// this allows to reward users with TGT
    uint256 public internalTgtBalance;
    /// @notice Array of tokens that users can claim
    IERC20[] public rewardTokens;
    mapping(IERC20 => bool) public isRewardToken;
    /// @notice Last reward balance of `token`
    mapping(IERC20 => uint256) public lastRewardBalance;

    address public feeCollector;

    /// @notice The deposit fee, scaled to `DEPOSIT_FEE_PERCENT_PRECISION`
    uint256 public depositFeePercent;
    /// @notice The precision of `depositFeePercent`
    uint256 public DEPOSIT_FEE_PERCENT_PRECISION;

    /// @notice Accumulated `token` rewards per share, scaled to `ACC_REWARD_PER_SHARE_PRECISION`
    mapping(IERC20 => uint256) public accRewardPerShare;
    /// @notice The precision of `accRewardPerShare`
    uint256 public ACC_REWARD_PER_SHARE_PRECISION;

    /// @dev Info of each user that stakes TGT
    mapping(address => UserInfo) private userInfo;

    /// @notice Emitted when a user deposits TGT
    event Deposit(address indexed user, uint256 amount, uint256 fee);

    /// @notice Emitted when owner changes the deposit fee percentage
    event DepositFeeChanged(uint256 newFee, uint256 oldFee);

    /// @notice Emitted when a user withdraws TGT
    event Withdraw(address indexed user, uint256 amount);

    /// @notice Emitted when a user claims reward
    event ClaimReward(address indexed user, address indexed rewardToken, uint256 amount);

    /// @notice Emitted when a user emergency withdraws its TGT
    event EmergencyWithdraw(address indexed user, uint256 amount);

    /// @notice Emitted when owner adds a token to the reward tokens list
    event RewardTokenAdded(address token);

    /// @notice Emitted when owner removes a token from the reward tokens list
    event RewardTokenRemoved(address token);

    /**
     * @notice Initialize a new TGTStaking contract
     * @dev This contract needs to receive an ERC20 `_rewardToken` in order to distribute them
     * (with MoneyMaker in our case)
     * @param _rewardToken The address of the ERC20 reward token
     * @param _tgt The address of the TGT token
     * @param _feeCollector The address where deposit fees will be sent
     * @param _depositFeePercent The deposit fee percent, scaled to 1e18, e.g. 3% is 3e16
     */
    constructor(
        IERC20 _rewardToken,
        IERC20 _tgt,
        address _feeCollector,
        uint256 _depositFeePercent
    ) {
        require(address(_rewardToken) != address(0), "TGTStaking: reward token can't be address(0)");
        require(address(_tgt) != address(0), "TGTStaking: tgt can't be address(0)");
        require(_feeCollector != address(0), "TGTStaking: fee collector can't be address(0)");
        require(_depositFeePercent <= 5e17, "TGTStaking: max deposit fee can't be greater than 50%");

        tgt = _tgt;
        depositFeePercent = _depositFeePercent;
        feeCollector = _feeCollector;

        isRewardToken[_rewardToken] = true;
        rewardTokens.push(_rewardToken);
        DEPOSIT_FEE_PERCENT_PRECISION = 1e18;
        ACC_REWARD_PER_SHARE_PRECISION = 1e24;
    }

    /**
     * @notice Deposit TGT for reward token allocation
     * @param _amount The amount of TGT to deposit
     */
    function deposit(uint256 _amount) external {
        UserInfo storage user = userInfo[_msgSender()];

        uint256 _fee = _amount * depositFeePercent / DEPOSIT_FEE_PERCENT_PRECISION;
        uint256 _amountMinusFee = _amount - _fee;

        uint256 _previousAmount = user.amount;
        if (_previousAmount == 0) {
            user.depositTimestamp = block.timestamp;
        }
        uint256 _newAmount = user.amount + _amountMinusFee;
        user.amount = _newAmount;

        uint256 _len = rewardTokens.length;
        for (uint256 i; i < _len; i++) {
            IERC20 _token = rewardTokens[i];
            updateReward(_token);

            uint256 _previousRewardDebt = user.rewardDebt[_token];
            user.rewardDebt[_token] = (getStakingMultiplier(_msgSender()) * (_newAmount * accRewardPerShare[_token] / ACC_REWARD_PER_SHARE_PRECISION)) / 1e18;

            if (_previousAmount != 0) {
                uint256 _pending = (getStakingMultiplier(_msgSender()) * (_previousAmount * accRewardPerShare[_token] / ACC_REWARD_PER_SHARE_PRECISION) / 1e18 - _previousRewardDebt);
                if (_pending != 0) {
                    safeTokenTransfer(_token, _msgSender(), _pending);
                    emit ClaimReward(_msgSender(), address(_token), _pending);
                }
            }
        }

        internalTgtBalance = internalTgtBalance + _amountMinusFee;
        tgt.safeTransferFrom(_msgSender(), feeCollector, _fee);
        tgt.safeTransferFrom(_msgSender(), address(this), _amountMinusFee);
        emit Deposit(_msgSender(), _amountMinusFee, _fee);
    }

    /**
     * @notice Get user info
     * @param _user The address of the user
     * @param _rewardToken The address of the reward token
     * @return The amount of TGT user has deposited
     * @return The reward debt for the chosen token
     */
    function getUserInfo(address _user, IERC20 _rewardToken) external view returns (uint256, uint256) {
        UserInfo storage user = userInfo[_user];
        return (user.amount, user.rewardDebt[_rewardToken]);
    }

    /**
     * @notice Get the number of reward tokens
     * @return The length of the array
     */
    function rewardTokensLength() external view returns (uint256) {
        return rewardTokens.length;
    }

    /**
     * @notice Add a reward token
     * @param _rewardToken The address of the reward token
     */
    function addRewardToken(IERC20 _rewardToken) external onlyOwner {
        require(
            !isRewardToken[_rewardToken] && address(_rewardToken) != address(0),
            "TGTStaking: token can't be added"
        );
        require(rewardTokens.length < 25, "TGTStaking: list of token too big");
        rewardTokens.push(_rewardToken);
        isRewardToken[_rewardToken] = true;
        updateReward(_rewardToken);
        emit RewardTokenAdded(address(_rewardToken));
    }

    /**
     * @notice Remove a reward token
     * @param _rewardToken The address of the reward token
     */
    function removeRewardToken(IERC20 _rewardToken) external onlyOwner {
        require(isRewardToken[_rewardToken], "TGTStaking: token can't be removed");
        updateReward(_rewardToken);
        isRewardToken[_rewardToken] = false;
        uint256 _len = rewardTokens.length;
        for (uint256 i; i < _len; i++) {
            if (rewardTokens[i] == _rewardToken) {
                rewardTokens[i] = rewardTokens[_len - 1];
                rewardTokens.pop();
                break;
            }
        }
        emit RewardTokenRemoved(address(_rewardToken));
    }

    /**
     * @notice Set the deposit fee percent
     * @param _depositFeePercent The new deposit fee percent
     */
    function setDepositFeePercent(uint256 _depositFeePercent) external onlyOwner {
        require(_depositFeePercent <= 5e17, "TGTStaking: deposit fee can't be greater than 50%");
        uint256 oldFee = depositFeePercent;
        depositFeePercent = _depositFeePercent;
        emit DepositFeeChanged(_depositFeePercent, oldFee);
    }

    /**
     * @notice View function to see pending reward token on frontend
     * @param _user The address of the user
     * @param _token The address of the token
     * @return `_user`'s pending reward token
     */
    function pendingReward(address _user, IERC20 _token) external view returns (uint256) {
        require(isRewardToken[_token], "TGTStaking: wrong reward token");
        UserInfo storage user = userInfo[_user];
        uint256 _totalTgt = internalTgtBalance;
        uint256 _accRewardTokenPerShare = accRewardPerShare[_token];

        uint256 _currRewardBalance = _token.balanceOf(address(this));
        uint256 _rewardBalance = _token == tgt ? _currRewardBalance - _totalTgt : _currRewardBalance;

        if (_rewardBalance != lastRewardBalance[_token] && _totalTgt != 0) {
            uint256 _accruedReward = _rewardBalance - lastRewardBalance[_token];
            _accRewardTokenPerShare = _accRewardTokenPerShare + (
                _accruedReward * ACC_REWARD_PER_SHARE_PRECISION / _totalTgt
            );
        }
        return (getStakingMultiplier(_user) * (user.amount * _accRewardTokenPerShare / ACC_REWARD_PER_SHARE_PRECISION) / 1e18 - user.rewardDebt[_token]);
    }

    /**
     * @notice To just harvest the rewards pass 0 as `_amount`, to harvest and withdraw pass the amount to withdraw
     * @param _amount The amount of TGT to withdraw if any
     */
    function withdraw(uint256 _amount) external {
        UserInfo storage user = userInfo[_msgSender()];
        uint256 _previousAmount = user.amount;
        require(_amount <= _previousAmount, "TGTStaking: withdraw amount exceeds balance");
        uint256 _newAmount = user.amount - _amount;
        user.amount = _newAmount;

        uint256 _len = rewardTokens.length;
        if (_previousAmount != 0) {
            for (uint256 i; i < _len; i++) {
                IERC20 _token = rewardTokens[i];
                updateReward(_token);

                uint256 _pending = (getStakingMultiplier(_msgSender()) * _previousAmount * accRewardPerShare[_token] / ACC_REWARD_PER_SHARE_PRECISION) / 1e18 - user.rewardDebt[_token];
                user.rewardDebt[_token] = (getStakingMultiplier(_msgSender()) * _newAmount * accRewardPerShare[_token] / ACC_REWARD_PER_SHARE_PRECISION) / 1e18;
//                console.log("pending", _pending);
                if (_pending != 0) {
                    safeTokenTransfer(_token, _msgSender(), _pending);
                    emit ClaimReward(_msgSender(), address(_token), _pending);
                }
            }
        }

        if (_amount > 0) {
            user.depositTimestamp = 0;
        }

        internalTgtBalance = internalTgtBalance - _amount;
        tgt.safeTransfer(_msgSender(), _amount);
        emit Withdraw(_msgSender(), _amount);
    }

    /**
     * @notice Withdraw without caring about rewards. EMERGENCY ONLY
     */
    function emergencyWithdraw() external {
        UserInfo storage user = userInfo[_msgSender()];

        uint256 _amount = user.amount;
        user.amount = 0;
        user.depositTimestamp = 0;

        uint256 _len = rewardTokens.length;
        for (uint256 i; i < _len; i++) {
            IERC20 _token = rewardTokens[i];
            user.rewardDebt[_token] = 0;
        }
        internalTgtBalance = internalTgtBalance - _amount;
        tgt.safeTransfer(_msgSender(), _amount);
        emit EmergencyWithdraw(_msgSender(), _amount);
    }

    /**
     * @notice Update reward variables
     * @param _token The address of the reward token
     * @dev Needs to be called before any deposit or withdrawal
     */
    function updateReward(IERC20 _token) public {
        require(isRewardToken[_token], "TGTStaking: wrong reward token");

        uint256 _totalTgt = internalTgtBalance;

        uint256 _currRewardBalance = _token.balanceOf(address(this));
        uint256 _rewardBalance = _token == tgt ? _currRewardBalance - _totalTgt : _currRewardBalance;

        // Did TGTStaking receive any token
        if (_rewardBalance == lastRewardBalance[_token] || _totalTgt == 0) {
            return;
        }

        uint256 _accruedReward = _rewardBalance - lastRewardBalance[_token];

        accRewardPerShare[_token] = accRewardPerShare[_token] + (
            _accruedReward * ACC_REWARD_PER_SHARE_PRECISION / _totalTgt
        );
        lastRewardBalance[_token] = _rewardBalance;
    }

    /**
     * @notice Safe token transfer function, just in case if rounding error
     * causes pool to not have enough reward tokens
     * @param _token The address of then token to transfer
     * @param _to The address that will receive `_amount` `rewardToken`
     * @param _amount The amount to send to `_to`
     */
    function safeTokenTransfer(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) internal {
        uint256 _currRewardBalance = _token.balanceOf(address(this));
        uint256 _rewardBalance = _token == tgt ? _currRewardBalance - internalTgtBalance : _currRewardBalance;

        if (_amount > _rewardBalance) {
            lastRewardBalance[_token] = lastRewardBalance[_token] - _rewardBalance;
            _token.safeTransfer(_to, _rewardBalance);
        } else {
            lastRewardBalance[_token] = lastRewardBalance[_token] - _amount;
            _token.safeTransfer(_to, _amount);
        }
    }

    function getStakingMultiplier(address _user) public view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        if (user.depositTimestamp == 0) {
            return 0;
        }
        uint256 timeDiff = (block.timestamp - user.depositTimestamp);
        if (timeDiff > 365 days) {
            return 2e18;
        } else if (timeDiff > (30 days * 6) && timeDiff < 365 days) {
            return (15e17 + (timeDiff / 365 days));
        }
        else if (timeDiff > 7 days && timeDiff < (30 days * 6)) {
            return (1e18 + (timeDiff / (30 days * 6)));
        }
        else if (timeDiff < 7 days && timeDiff > 0) {
            return 0;
        }
        return 0;
    }
}
