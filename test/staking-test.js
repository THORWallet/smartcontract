const {BN, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require("chai");
const {network, ethers} = require("hardhat");
const {getBlockNumber, mintNewBlock} = require("./utils/minting-blocks");

let token = undefined;
let vesting = undefined;
let staking = undefined;
let accounts = undefined;
let [initialHolder, secondAccount, thirdAccount, fourthAccount] = [];
let liveTime = undefined;

const b1m = new BN("1000000000000000000000000");
const b1Token = new BN("1000000000000000000");

// Requires evm_setAutomine=TRUE
describe("Staking", function () {
    beforeEach("deploy contracts and mint and vest", async function () {

        this.accounts = await ethers.getSigners();


        const TGT = await ethers.getContractFactory("TGT");
        this.token = await TGT.deploy();
        await this.token.deployed();

        const VST = await ethers.getContractFactory("Vesting");
        this.vesting = await VST.deploy(this.token.address);
        await this.vesting.deployed();

        [initialHolder, secondAccount, thirdAccount, fourthAccount] = this.accounts;
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

    afterEach("After", async function (){
        await network.provider.send("evm_setAutomine", [true]);
    })

    it('add pool', async function () {
        expect(await this.staking.connect(secondAccount).poolLength()).to.equal("0");
        await this.staking.connect(initialHolder).addPool(20, this.token.address, false);
        expect(await this.staking.connect(secondAccount).poolLength()).to.equal("1");
        await expectRevert.unspecified(this.staking.connect(initialHolder).addPool(20, this.token.address, false));
        expect(await this.staking.connect(secondAccount).poolLength()).to.equal("1");
    });

    it('test basic staking happy path', async function () {
        await this.staking.connect(initialHolder).addPool(20, this.token.address, false);

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
        await this.staking.connect(initialHolder).addPool(20, this.token.address, false);

        await this.token.connect(secondAccount).approve(this.staking.address, b1m.mul(new BN(10)).toString());
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(1)).toString(), secondAccount.address);
        const blockNumber1 = await getBlockNumber();

        expect(await this.token.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(9))
                .toString());

        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(3)).toString(), secondAccount.address);
        expect(await this.token.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(6))
                // reward for 1 block
                .add(b1Token.mul(new BN(1)))
                .toString()
        );
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(6)).toString(), secondAccount.address);
        const blockNumber2 = await getBlockNumber();
        expect(await this.token.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(0))
                // reward for 2 blocks
                .add(b1Token.mul(new BN(2)))
                .toString()
        );

        // verify number of minted blocks
        expect(blockNumber2-blockNumber1).to.equal(2);

        await this.staking.connect(secondAccount).withdraw(0, b1m.mul(new BN(5)).toString(), secondAccount.address);
        expect(await this.token.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(5))
                // reward for 3 blocks
                .add(b1Token.mul(new BN(3)))
                .toString()
        );
    });

    it('test staking with more than account', async function () {
        await this.staking.connect(initialHolder).addPool(20, this.token.address, false);

        await this.token.connect(secondAccount).approve(this.staking.address, b1m.mul(new BN(10)).toString());
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(5)).toString(), secondAccount.address);

        await this.token.connect(thirdAccount).approve(this.staking.address, b1m.mul(new BN(50)).toString());
        await this.staking.connect(thirdAccount).deposit(0, b1m.mul(new BN(20)).toString(), thirdAccount.address);
        await this.staking.connect(thirdAccount).deposit(0, b1m.mul(new BN(30)).toString(), thirdAccount.address);

        console.log("after third deposit")
        await this.staking.connect(secondAccount).harvest(0, secondAccount.address);
        expect(await this.token.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(5))
                // reward for 2 whole block rewards
                .add(b1Token.mul(new BN(2)))
                // 1 reward sharing with the 20 deposit
                .add(b1Token.mul(new BN(5)).div(new BN(5+20)))
                // 1 reward sharing with 20 and 30
                .add(b1Token.mul(new BN(5)).div(new BN(5+20+30)))
                // precision is at 10**12
                .sub(new BN('4090909090909'))
                .toString()
        );

        await this.staking.connect(thirdAccount).harvest(0, thirdAccount.address);
        expect(await this.token.balanceOf(thirdAccount.address)).to.equal(
            b1m.mul(new BN(0))
                // 1 reward sharing with the 5
                .add(b1Token.mul(new BN(20)).div(new BN(5+20)))
                // 2 rewards sharing with 5 with a bigger stake
                .add(b1Token.mul(new BN(2*50)).div(new BN(5+20+30)))
                // precision is at 10**12
                .sub(new BN("81818181818181"))
                .toString()
        );

        // we withdraw to another account
        await this.staking.connect(thirdAccount).withdraw(0, b1m.mul(new BN(25)).toString(), fourthAccount.address);
        expect(await this.token.balanceOf(fourthAccount.address)).to.equal(
            b1m.mul(new BN(25))
                // 1 reward sharing with 5 and a bigger stake
                .add(b1Token.mul(new BN(50)).div(new BN(5+20+30)))
                // precision is at 10**12
                .sub(new BN("40909090909090"))
                .toString()
        );
    });

    it('test deposit in same blocks 1', async function () {
        await this.staking.connect(initialHolder).addPool(20, this.token.address, false);

        await this.token.connect(secondAccount).approve(this.staking.address, b1m.mul(new BN(10)).toString());

        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(1)).toString(), secondAccount.address);

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(8)).toString(), secondAccount.address);
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(1)).toString(), secondAccount.address);
        await mintNewBlock();

        expect(await this.token.balanceOf(secondAccount.address)).to.equal(b1Token.toString());
    });

    it('test deposit in same blocks 2', async function () {
        await this.staking.connect(initialHolder).addPool(20, this.token.address, false);

        await this.token.connect(secondAccount).approve(this.staking.address, b1m.mul(new BN(10)).toString());

        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(1)).toString(), secondAccount.address);

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(8)).toString(), secondAccount.address);
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(1)).toString(), secondAccount.address);
        await mintNewBlock();

        expect(await this.token.balanceOf(secondAccount.address)).to.equal(b1Token.toString());
    });

    it('test deposit in same blocks 3', async function () {
        await this.staking.connect(initialHolder).addPool(20, this.token.address, false);

        await this.token.connect(secondAccount).approve(this.staking.address, b1m.mul(new BN(10)).toString());

        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(1)).toString(), secondAccount.address);

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(1)).toString(), secondAccount.address);
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(200)).toString(), secondAccount.address);
        await mintNewBlock();

        expect(await this.token.balanceOf(secondAccount.address)).to.equal(b1m.mul(new BN(10-2)).add(b1Token).toString());
    });

    it('test deposit and withdraw in same blocks', async function () {
        await this.staking.connect(initialHolder).addPool(20, this.token.address, false);

        await this.token.connect(secondAccount).approve(this.staking.address, b1m.mul(new BN(10)).toString());

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(10)).toString(), secondAccount.address);
        await this.staking.connect(secondAccount).withdraw(0, b1m.mul(new BN(10)).toString(), secondAccount.address);
        await mintNewBlock();

        expect(await this.token.balanceOf(secondAccount.address)).to.equal(b1m.mul(new BN(10)).toString());
    });

    it('test withdraw in same blocks', async function () {
        await this.staking.connect(initialHolder).addPool(20, this.token.address, false);

        await this.token.connect(secondAccount).approve(this.staking.address, b1m.mul(new BN(10)).toString());

        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(10)).toString(), secondAccount.address);

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).withdraw(0, b1m.mul(new BN(1)).toString(), secondAccount.address);
        await this.staking.connect(secondAccount).withdraw(0, b1m.mul(new BN(8)).toString(), secondAccount.address);
        await this.staking.connect(secondAccount).withdraw(0, b1m.mul(new BN(1)).toString(), secondAccount.address);
        await mintNewBlock();

        expect(await this.token.balanceOf(secondAccount.address)).to.equal(b1m.mul(new BN(10)).add(b1Token).toString());
    });

    it('test withdraw in same blocks 3', async function () {
        await this.staking.connect(initialHolder).addPool(20, this.token.address, false);

        await this.token.connect(secondAccount).approve(this.staking.address, b1m.mul(new BN(10)).toString());

        await this.staking.connect(secondAccount).deposit(0, b1m.mul(new BN(10)).toString(), secondAccount.address);

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).withdraw(0, b1m.mul(new BN(1)).toString(), secondAccount.address);
        await this.staking.connect(secondAccount).withdraw(0, b1m.mul(new BN(200)).toString(), secondAccount.address);
        await this.staking.connect(secondAccount).withdraw(0, b1m.mul(new BN(1)).toString(), secondAccount.address);
        await mintNewBlock();

        // second transaction should not have been successful so only 2 are withdrawn
        expect(await this.token.balanceOf(secondAccount.address)).to.equal(b1m.mul(new BN(2)).add(b1Token).toString());
    });
});
