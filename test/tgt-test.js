const {BN, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require("chai");
const hre = require("hardhat");

//from: https://github.com/OpenZeppelin/openzeppelin-contracts/tree/master/test/token/ERC20
const {shouldBehaveLikeERC20} = require('./utils/ERC20.behavior');
const {allowanceERC20} = require('./utils/ERC20.allowance');

let token = undefined;
let accounts = undefined;
let initialSupply = new BN("460000000000000000000000000");

describe("TGT", function () {

    beforeEach("Should print the token name", async function () {
        const TGT = await ethers.getContractFactory("TGT");
        this.token = await TGT.deploy();
        await this.token.deployed();
        this.accounts = await hre.ethers.getSigners();
    });

    it('has a name', async function () {
        expect(await this.token.name()).to.equal("THORWallet Governance Token");
    });

    it('has a symbol', async function () {
        expect(await this.token.symbol()).to.equal("TGT");
    });

    it('has 18 decimals', async function () {
        expect(await this.token.decimals()).to.equal(18);
    });

    describe("Test Basic ERC20", function () {
        it('shouldBehaveLikeERC20', async function () {
            const [initialHolder, recipient, anotherAccount] = this.accounts;
            let acc = new Array(initialHolder.address);
            let amount = new Array(initialSupply.toString());
            await this.token.mint(acc, amount);
            await this.token.mintFinish();
            shouldBehaveLikeERC20('ERC20', initialSupply, initialHolder, recipient, anotherAccount, this.token);
        });
    });

    describe("Test Allowance ERC20", function () {
        it('shouldBehaveLikeERC20', async function () {
            const [initialHolder, recipient, anotherAccount] = this.accounts;
            let acc = new Array(initialHolder.address);
            let amount = new Array(initialSupply.toString());
            await this.token.mint(acc, amount);
            await this.token.mintFinish();
            allowanceERC20('ERC20', initialSupply, initialHolder, recipient, anotherAccount, this.token);
        });
    });

    it('mint with not the full 460m should fail', async function () {
        const [initialHolder] = this.accounts;
        let acc = new Array(initialHolder.address);
        let amount = new Array(new BN("100").toString());
        await this.token.mint(acc, amount);
        await expectRevert.unspecified(this.token.mintFinish(), "TGT: supply mismatch");
    });
});
