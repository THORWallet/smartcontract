const {BN, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require("chai");
const hre = require("hardhat");
const {getBlockNumber} = require("./utils/minting-blocks");

let token = undefined;
let vesting = undefined;
let staking = undefined;
let accounts = undefined;
let [initialHolder, secondAccount, thirdAccount] = [];
let liveTime = undefined;

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

        [initialHolder, secondAccount, thirdAccount] = this.accounts;
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

        // we need to approve the staking contract to spend money from the reserve
        await this.token.connect(initialHolder).approve(this.staking.address, b1m.mul(new BN(400)).toString());
    });

    it('add pool', async function () {
        expect(await this.staking.connect(secondAccount).poolLength()).to.equal("0");
        await this.staking.connect(initialHolder).add(20, this.token.address, false);
        expect(await this.staking.connect(secondAccount).poolLength()).to.equal("1");
        await expectRevert.unspecified(this.staking.connect(initialHolder).add(20, this.token.address, false));
        expect(await this.staking.connect(secondAccount).poolLength()).to.equal("1");
    });

    it('test basic staking happy path', async function () {
        await this.staking.connect(initialHolder).add(20, this.token.address, false);

        await this.token.connect(secondAccount).approve(this.staking.address, b1m.mul(new BN(10)).toString());
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(10)).toString(), secondAccount.address);
        expect(await this.token.balanceOf(secondAccount.address)).to.equal("0");

        await this.staking.connect(secondAccount).harvest(0, secondAccount.address);
        expect(await this.token.balanceOf(secondAccount.address)).to.equal(b1Token.toString());

        await this.staking.connect(secondAccount).withdraw(0, b1m.mul(new BN(10)).toString(), secondAccount.address);
        expect(await this.token.balanceOf(secondAccount.address)).to.equal(
            // harvested before
            b1Token
                // withdraw 10mio
                .add(b1m.mul(new BN(10)))
                // 1 TGT reward from another block automatically harvested
                .add(b1Token)
                .toString()
        );
    });

    it('test staking with more than one deposit', async function () {
        await this.staking.connect(initialHolder).add(20, this.token.address, false);

        let blockNumber1;
        let blockNumber2;

        await this.token.connect(secondAccount).approve(this.staking.address, b1m.mul(new BN(10)).toString());
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(1)).toString(), secondAccount.address);
        blockNumber1 = await getBlockNumber();
        expect(await this.token.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(9))
                .toString());

        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(3)).toString(), secondAccount.address);
        blockNumber2 = await getBlockNumber();
        expect(await this.token.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(6))
                .add(b1Token.mul(new BN(blockNumber2-blockNumber1)))
                .toString()
        );
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(6)).toString(), secondAccount.address);
        blockNumber2 = await getBlockNumber();
        expect(await this.token.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(0))
                .add(b1Token.mul(new BN(blockNumber2-blockNumber1)))
                .toString()
        );
    });
});
