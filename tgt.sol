// SPDX-License-Identifier: MPL

pragma solidity ~0.8.4;

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

//interface IERC20 comes from openzeppelin
interface IERC20Metadata is IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

// From https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/draft-IERC20Permit.sol
interface IERC20Permit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
    function nonces(address owner) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

//the function transferFromAndCall was added so that with a permit, also a function can be called
interface IERC677ish {
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool success);
    function transferFromAndCall(address sender, address to, uint256 value, bytes calldata data) external returns (bool success);
    event TransferWithData(address indexed from, address indexed to, uint256 value, bytes data);
}

interface IERC677Receiver {
  function onTokenTransfer(address sender, uint value, bytes calldata data) external;
}

contract ERC20 is IERC20Metadata, IERC20Permit, IERC677ish, EIP712 {
    mapping(address => uint256) private _balances;
    mapping(address => Vesting) private _vesting;
    mapping(address => mapping(address => uint256)) private _allowances;
    
    struct Vesting {
        //96bit are enough: max value is 1000000000000000000000000000
        //96bit are:                    79228162514264337593543950336
        uint96 cliffAmount;
        uint96 vestingStartAmount;
        //64bit for timestamp in seconds lasts 584 billion years
        uint64 vestingDuration;
    }

    uint256 private _totalSupply;
    uint64 private _live = 0;
    address private _owner;
    uint64 private _lastEmitAt;
    uint8 private _curveSteep =  4;
    uint8 private _curveEnd =  96; //8 years in month
    
    uint96 constant MAX_SUPPLY  = 1000000000 * (10**18); //1 billion
    uint16 constant CURVE_TOP =  989;
    uint64 constant MAX_INT = 2**64 - 1;
    
    constructor() EIP712(symbol(), "1") {
        _owner = msg.sender;
    }
    
    function setCurve(uint8 curveSteep, uint8 curveEnd) public virtual {
        require(_owner == msg.sender, "TGT: not the owner");
        _curveSteep = curveSteep;
        _curveEnd = curveEnd;
    }
    
    function transferOwner(address newOwner) public virtual {
        require(_owner == msg.sender, "TGT: not the owner");
        _owner = newOwner;
    }

    function name() public view virtual override returns (string memory) {
        return "THORWallet Governance Token";
    }

    function symbol() public view virtual override returns (string memory) {
        return "TGT";
    }

   
    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        require(recipient != address(0), "ERC20: transfer to the zero address");
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        require(recipient != address(0), "ERC20: transfer to the zero address");
        _transfer(sender, recipient, amount);

        uint256 currentAllowance = _allowances[sender][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        unchecked {
            _approve(sender, msg.sender, currentAllowance - amount);
        }

        return true;
    }
    
    function burn(uint256 amount) public virtual {
        _transfer(msg.sender, address(0), amount);
        _totalSupply -= amount;
    }
    
    function mint(address[] calldata account, uint96[] calldata amount, uint96[] calldata cliffAmounts, 
                  uint96[] calldata vestingTotalAmounts, uint64[] calldata vestingDurations) public virtual {
        require(msg.sender == _owner);
        require(account.length == amount.length);
        require(amount.length == cliffAmounts.length);
        require(cliffAmounts.length == vestingTotalAmounts.length);
        require(vestingTotalAmounts.length == vestingDurations.length);
        require(_live == 0);
        
        for(uint256 i=0;i<account.length;i++) {
            require(account[i] != address(0), "ERC20: mint to the zero address");

            if(cliffAmounts[i] != 0) {
                _vesting[account[i]] = Vesting(cliffAmounts[i], vestingTotalAmounts[i] - cliffAmounts[i], vestingDurations[i]);
            }

            _totalSupply += amount[i];
            _balances[account[i]] += amount[i];
            emit Transfer(address(0), account[i], amount[i]);
        }
    }
    
    function emitTokens() internal virtual {
        uint64 timeInM = uint64((block.timestamp - _live) / (60 * 60 * 24 * 30));
        if (timeInM <= _lastEmitAt) {
            return;
        }

        uint256 expectedSupplyNow;
        uint256 expectedSupplyPre;
        if (timeInM >= _curveEnd) {
            expectedSupplyPre = CURVE_TOP * 1000000 * 10**18;
            expectedSupplyNow = MAX_SUPPLY;
            timeInM = MAX_INT;
        } else {
            expectedSupplyNow = emitCurve(timeInM) * 10**18;
            expectedSupplyPre = emitCurve(_lastEmitAt) * 10**18;
        }
        
        //towards the end the curve may go down, don't fail
        if(expectedSupplyPre >= expectedSupplyNow) {
            return;
        }
        uint256 additionalAmount = expectedSupplyNow - expectedSupplyPre;
        _totalSupply += additionalAmount;
        _balances[_owner] += additionalAmount;
        _lastEmitAt = timeInM;
    }
    
    //https://www.desmos.com/calculator/fmbbfvtwux
    //(989 - (x/4-23)^2 * 1000000
    //989 controls the total height
    //4 - CURVE_STEEP - controls how steep the curve is
    //23 shifts the curve 
    //max will be reached in 92 month
    function emitCurve(uint256 x) internal virtual returns (uint256) {
        uint256 i = (x/_curveSteep - 23)**2;
        return (CURVE_TOP - i) * 1000000; 
    }
    
    function mintFinish() public virtual {
        require(msg.sender == _owner);
        _live = uint64(block.timestamp);
    }

    function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender] + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool) {
        uint256 currentAllowance = _allowances[msg.sender][spender];
        require(currentAllowance >= subtractedValue, "ERC20: decreased allowance below zero");
        unchecked {
            _approve(msg.sender, spender, currentAllowance - subtractedValue);
        }

        return true;
    }
    
    function transferAndCall(address to, uint value, bytes calldata data) public virtual override returns (bool success) {
        transfer(to, value);
        emit TransferWithData(msg.sender, to, value, data);
        if (isContract(to)) {
            IERC677Receiver(to).onTokenTransfer(msg.sender, value, data);
        }
        return true;
    }
    
    function transferFromAndCall(address sender, address to, uint value, bytes calldata data) public virtual override returns (bool success) {
        transferFrom(sender, to, value);
        emit TransferWithData(sender, to, value, data);
        if (isContract(to)) {
            IERC677Receiver(to).onTokenTransfer(sender, value, data);
        }
        return true;
    }

    function isContract(address addr) private view returns (bool hasCode) {
        uint length;
        assembly { length := extcodesize(addr) }
        return length > 0;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        
        require(_live != 0);

        uint256 senderBalance = _balances[sender];
        require(senderBalance >= amount, "ERC20: transfer amount exceeds balance");
        
        if(_vesting[msg.sender].cliffAmount > 0) {
            uint256 linearVesting = _vesting[msg.sender].vestingStartAmount/_vesting[msg.sender].vestingDuration*(block.timestamp - _live);
            require(senderBalance - amount >= _vesting[msg.sender].cliffAmount + linearVesting);
        }
        
        unchecked {
            _balances[sender] = senderBalance - amount;
        }
        _balances[recipient] += amount;
        
        emitTokens();
        emit Transfer(sender, recipient, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        require(_live != 0);

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
    
    // ************ ERC777 ********************
    using Counters for Counters.Counter;
    mapping (address => Counters.Counter) private _nonces;
    bytes32 private immutable _PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) public virtual override {
        require(block.timestamp <= deadline, "ERC20Permit: expired deadline");
        bytes32 structHash = keccak256(abi.encode(_PERMIT_TYPEHASH, owner, spender, value, _useNonce(owner), deadline));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);
        require(signer == owner, "ERC20Permit: invalid signature");
        _approve(owner, spender, value);
    }

    function nonces(address owner) public view virtual override returns (uint256) {
        return _nonces[owner].current();
    }

    function DOMAIN_SEPARATOR() external view override returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _useNonce(address owner) internal virtual returns (uint256 current) {
        Counters.Counter storage nonce = _nonces[owner];
        current = nonce.current();
        nonce.increment();
    }
}