const {BN, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require("chai");
const hre = require("hardhat");
const {setBlockTimestampInSeconds, setBlockTimestampInMonth, setBlockTimestampInMonthAndSeconds, mintNewBlock} = require("./utils/minting-blocks");

//from: https://github.com/OpenZeppelin/openzeppelin-contracts/tree/master/test/token/ERC20
const {shouldBehaveLikeERC20} = require('./utils/ERC20.behavior');
const {allowanceERC20} = require('./utils/ERC20.allowance');

let token = undefined;
let vesting = undefined;
let staking = undefined;
let accounts = undefined;
let liveTime = undefined;
const initialSupply = new BN("750000000000000000000000000");
const maxSupply = new BN("1000000000000000000000000000");
const b1m = new BN("1000000000000000000000000");
const b1Token = new BN("1000000000000000000");

describe("Staking", function () {

    beforeEach("deploy contracts and mint and vest", async function () {
        this.accounts = await hre.ethers.getSigners();

        const TGT = await ethers.getContractFactory("TGT");
        this.token = await TGT.deploy();
        await this.token.deployed();

        const VST = await ethers.getContractFactory("Vesting");
        this.vesting = await VST.deploy(this.token.address);
        await this.vesting.deployed();

        const [initialHolder, secondAccount, thirdAccount] = this.accounts;
        const acc = [
            initialHolder.address,
            this.vesting.address,
            secondAccount.address,
            thirdAccount.address
        ];
        const amount = [
            b1m.mul(new BN(400)).toString(),
            b1m.mul(new BN(290)).toString(),
            b1m.mul(new BN(10)).toString(),
            b1m.mul(new BN(50)).toString()
        ];
        await this.token.mint(acc, amount);
        await this.token.mintFinish();
        const liveTime = await this.token.live();

        const acc2 = [secondAccount.address, thirdAccount.address];
        const amount2 = [
            b1m.mul(new BN(90)).toString(),
            b1m.mul(new BN(200)).toString()
        ];
        const duration2 = [60 * 60 * 24 * 30 * 12, 60 * 60 * 24 * 30 * 12 * 3];

        await this.vesting.vest(acc2, amount2, duration2);

        const STK = await ethers.getContractFactory("Staking");
        this.staking = await STK.deploy(this.token.address, initialHolder.address, b1Token.toString());
        await this.staking.deployed();
    });


    it('test staking happy path', async function () {
      console.log("test")
    });
});
