// SPDX-License-Identifier: MPL

pragma solidity ~0.8.4;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IERC20Metadata is IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

contract ERC20 is IERC20, IERC20Metadata {
    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _vesting;
    mapping(address => mapping(address => uint256)) private _allowances;
    
    // tiers - map of address to a map of tier-values to the timestamp when the tier was reached
    mapping(address => mapping(uint256 => uint256)) private _tiers;
    uint256[] _tierValues;
    
    event TierReached(address indexed recipient, uint256 tierValue, uint256 tierReachedAt);
    event TierLeft(address indexed spender, uint256 tierValue, uint256 tierLeftAt, uint256 tierReachedAt);

    uint256 private _totalSupply;
    bool private mintDone = false;
    address private _owner;
    
    constructor() {
        _owner = msg.sender;
    }

    
    function name() public view virtual override returns (string memory) {
        return "Thorwallet Token";
    }

    function symbol() public view virtual override returns (string memory) {
        return "THW";
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
        _transfer(sender, recipient, amount);

        uint256 currentAllowance = _allowances[sender][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        unchecked {
            _approve(sender, msg.sender, currentAllowance - amount);
        }

        return true;
    }
    
    function burn(uint256 amount) public virtual {
        require(_vesting[msg.sender] < block.timestamp);
        require(mintDone);

        uint256 accountBalance = _balances[msg.sender];
        require(accountBalance >= amount, "ERC20: burn amount exceeds balance");
        unchecked {
            _balances[msg.sender] = accountBalance - amount;
        }
        _totalSupply -= amount;

        emit Transfer(msg.sender, address(0), amount);
    }
    
    function mint(address[] calldata account, uint256[] calldata amount, uint256[] calldata transferableFrom) public virtual {
        require(msg.sender == _owner);
        require(account.length == amount.length);
        require(amount.length == transferableFrom.length);
        require(!mintDone);
        
        for(uint256 i=0;i<account.length;i++) {
            require(account[i] != address(0), "ERC20: mint to the zero address");

            if(transferableFrom[i] != 0) {
                _vesting[account[i]] = transferableFrom[i];
            }

            _totalSupply += amount[i];
            _balances[account[i]] += amount[i];
            emit Transfer(address(0), account[i], amount[i]);
        }
    }
    
    function mintFinish() public virtual {
        require(msg.sender == _owner);
        mintDone = true;
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
    
    function tiers(address account, uint256 value) public view returns (uint256) {
        return _tiers[account][value];
    }
    
    function addTier(uint256 value) public virtual {
        require(msg.sender == _owner);
        _tierValues.push(value);
    }

    function _transfer(address sender, address recipient, uint256 amount) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");
        require(_vesting[sender] < block.timestamp);
        require(mintDone);

        uint256 senderBalance = _balances[sender];
        require(senderBalance >= amount, "ERC20: transfer amount exceeds balance");
        unchecked {
            _balances[sender] = senderBalance - amount;
        }
        _balances[recipient] += amount;
        
        for (uint256 i=0;i<_tierValues.length;i++) {
            //add address to the list if it has more coins than the threshold
            if(_balances[recipient] >= _tierValues[i] && _tiers[recipient][_tierValues[i]] == 0) {
                _tiers[recipient][_tierValues[i]] = block.timestamp;
                emit TierReached(recipient, _tierValues[i], block.timestamp);
            }
            //remove coin if it has less coins than the threshold
            if(_balances[sender] < _tierValues[i] && _tiers[sender][_tierValues[i]] > 0) {
                emit TierLeft(sender, _tierValues[i], block.timestamp, _tiers[sender][_tierValues[i]]);
                delete _tiers[sender][_tierValues[i]];
            }
        }
        
        emit Transfer(sender, recipient, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        require(mintDone);

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
    
}
