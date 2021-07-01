// SPDX-License-Identifier: MPL

pragma solidity ~0.8.4;

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

interface IERC20Metadata is IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

interface IERC20Permit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
    function nonces(address owner) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

interface IERC677 {
  function transferAndCall(address to, uint value, bytes calldata data) external returns (bool success);
  event TransferWithData(address indexed from, address indexed to, uint value, bytes data);
}

interface IERC677Receiver {
  function onTokenTransfer(address _sender, uint _value, bytes calldata _data) external;
}

contract ERC20 is IERC20Metadata, IERC20Permit, IERC677, EIP712 {
    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _vesting;
    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;
    bool private mintDone = false;
    address private _owner;
    
    constructor(string memory _name) EIP712(_name, "1") {
        _owner = msg.sender;
    }

    function name() public view virtual override returns (string memory) {
        return "THORWallet Token";
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
    
    function transferAndCall(address _to, uint _value, bytes calldata _data) public override returns (bool success) {
        transfer(_to, _value);
        emit TransferWithData(msg.sender, _to, _value, _data);
        if (isContract(_to)) {
            contractFallback(msg.sender, _to, _value, _data);
        }
        return true;
    }
    
    function transferFromAndCall(address sender, address _to, uint _value, bytes calldata _data) public returns (bool success) {
        transferFrom(sender, _to, _value);
        emit TransferWithData(sender, _to, _value, _data);
        if (isContract(_to)) {
            contractFallback(sender, _to, _value, _data);
        }
        return true;
    }

    function contractFallback(address sender, address _to, uint _value, bytes calldata _data)  internal virtual {
        IERC677Receiver receiver = IERC677Receiver(_to);
        receiver.onTokenTransfer(sender, _value, _data);
    }

    function isContract(address _addr) private view returns (bool hasCode) {
        uint length;
        assembly { length := extcodesize(_addr) }
        return length > 0;
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
        
        emit Transfer(sender, recipient, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        require(mintDone);

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
    
    //************ ERC777 ********************
    
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
