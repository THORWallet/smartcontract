const {BN, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require("chai");
const {network, ethers} = require("hardhat");
const {getBlockNumber, mintNewBlock} = require("./utils/minting-blocks");
const {utils} = require("ethers");

let tgt = undefined;
let usdc = undefined;
let vesting = undefined;
let staking = undefined;
let accounts = undefined;
let [initialHolder, secondAccount, thirdAccount, fourthAccount] = [];
let liveTime = undefined;

const b1m = new BN("1000000000000000000000000");

// Requires evm_setAutomine=TRUE
describe("Staking", function () {
    beforeEach("deploy contracts and mint and vest", async function () {

        this.accounts = await ethers.getSigners();

        const TGT = await ethers.getContractFactory("TGT");
        this.tgt = await TGT.deploy();
        await this.tgt.deployed();

        const USDC = await ethers.getContractFactory("USDC");
        this.usdc = await USDC.deploy();
        await this.usdc.deployed();

        [initialHolder, secondAccount, thirdAccount, fourthAccount] = this.accounts;
        const acc = [
            initialHolder.address,
            secondAccount.address,
            thirdAccount.address
        ];
        const amount = [
            utils.parseUnits("400", 18),
            utils.parseUnits("10", 18),
            utils.parseUnits("50", 18)
        ];
        await this.tgt.mint(acc, amount);
        await this.usdc.mint(acc, amount);
        await this.tgt.mintFinish();

        const STK = await ethers.getContractFactory("StakingV2");
        this.staking = await STK.deploy(
            [{
                rewardToken: this.tgt.address,
                rewardOwner: initialHolder.address,
                rewardPerBlock: 20,
                accRewardPerShare: 0
            }, {
                rewardToken: this.usdc.address,
                rewardOwner: initialHolder.address,
                rewardPerBlock: 20,
                accRewardPerShare: 0
            }],
        );
        await this.staking.deployed();

        // we need to approve the staking contract to spend money from the reserve
        await this.tgt.connect(initialHolder).approve(this.staking.address, utils.parseUnits("400", 18).toString());
        await this.usdc.connect(initialHolder).approve(this.staking.address, utils.parseUnits("400", 18).toString());
    });

    afterEach("After", async function () {
        await network.provider.send("evm_setAutomine", [true]);
    })

    it('set pool', async function () {
        await this.staking.connect(initialHolder).setPool(20, this.tgt.address);
        expect(await this.staking.lpToken()).to.equal(this.tgt.address);
    });

    it('test basic staking happy path', async function () {
        await this.staking.connect(initialHolder).setPool(20, this.tgt.address);
// /todo first fix this part
        await this.tgt.connect(secondAccount).approve(this.staking.address, utils.parseUnits("10", 18));
        console.log("tgt balance: " + await this.tgt.balanceOf(secondAccount.address));
        mintNewBlock();
        await this.staking.connect(secondAccount).deposit(utils.parseUnits("10", 18), secondAccount.address);
        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal("0");
        mintNewBlock();
        mintNewBlock();

        await this.staking.connect(secondAccount).harvest(secondAccount.address);

        console.log("tgt balance: " + await this.tgt.balanceOf(secondAccount.address));

        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(utils.parseUnits("1", 18));

        // await this.staking.connect(secondAccount).withdraw(utils.parseUnits("10", 18), secondAccount.address);
        // expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(
        //     // harvested before
        //     utils.parseUnits("1", 18)
        //         // withdraw 10mio
        //         .add(utils.parseUnits("10", 18))
        //         // 1 TGT reward from another block automatically harvested
        //         .add(utils.parseUnits("1", 18))
        //         .toString()
        // );
    });

    it('test staking with more than one deposit', async function () {
        await this.staking.connect(initialHolder).setPool(20, this.tgt.address);

        await this.tgt.connect(secondAccount).approve(this.staking.address, utils.parseUnits("10", 18));
        await this.staking.connect(secondAccount).deposit(utils.parseUnits("1", 18), secondAccount.address);
        const blockNumber1 = await getBlockNumber();

        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(utils.parseUnits("9", 18).toString());

        await this.staking.connect(secondAccount).deposit(utils.parseUnits("3", 18), secondAccount.address);
        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(6))
                // reward for 1 block
                .add(utils.parseUnits("1", 18).mul(new BN(1)))
                .toString()
        );
        await this.staking.connect(secondAccount).deposit(utils.parseUnits("6", 18), secondAccount.address);
        const blockNumber2 = await getBlockNumber();
        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(0))
                // reward for 2 blocks
                .add(utils.parseUnits("1", 18).mul(new BN(2)))
                .toString()
        );

        // verify number of minted blocks
        expect(blockNumber2 - blockNumber1).to.equal(2);

        await this.staking.connect(secondAccount).withdraw(utils.parseUnits("5", 18), secondAccount.address);
        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(
            utils.parseUnits("5", 18)
                // reward for 3 blocks
                .add(utils.parseUnits("3", 18)));
    });

    it('test staking with more than account', async function () {
        await this.staking.connect(initialHolder).setPool(20, this.tgt.address);

        await this.tgt.connect(secondAccount).approve(this.staking.address, utils.parseUnits("10", 18));
        await this.staking.connect(secondAccount).deposit(b1m.mul(new BN(5)).toString(), secondAccount.address);

        await this.tgt.connect(thirdAccount).approve(this.staking.address, b1m.mul(new BN(50)).toString());
        await this.staking.connect(thirdAccount).deposit(b1m.mul(new BN(20)).toString(), thirdAccount.address);
        await this.staking.connect(thirdAccount).deposit(b1m.mul(new BN(30)).toString(), thirdAccount.address);

        console.log("after third deposit")
        await this.staking.connect(secondAccount).harvest(secondAccount.address);
        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(
            b1m.mul(new BN(5))
                // reward for 2 whole block rewards
                .add(utils.parseUnits("1", 18).mul(new BN(2)))
                // 1 reward sharing with the 20 deposit
                .add(utils.parseUnits("1", 18).mul(new BN(5)).div(new BN(5 + 20)))
                // 1 reward sharing with 20 and 30
                .add(utils.parseUnits("1", 18).mul(new BN(5)).div(new BN(5 + 20 + 30)))
                // precision is at 10**12
                .sub(new BN('4090909090909'))
                .toString()
        );

        await this.staking.connect(thirdAccount).harvest(thirdAccount.address);
        expect(await this.tgt.balanceOf(thirdAccount.address)).to.equal(
            b1m.mul(new BN(0))
                // 1 reward sharing with the 5
                .add(utils.parseUnits("1", 18).mul(new BN(20)).div(new BN(5 + 20)))
                // 2 rewards sharing with 5 with a bigger stake
                .add(utils.parseUnits("1", 18).mul(new BN(2 * 50)).div(new BN(5 + 20 + 30)))
                // precision is at 10**12
                .sub(new BN("81818181818181"))
                .toString()
        );

        // we withdraw to another account
        await this.staking.connect(thirdAccount).withdraw(b1m.mul(new BN(25)).toString(), fourthAccount.address);
        expect(await this.tgt.balanceOf(fourthAccount.address)).to.equal(
            b1m.mul(new BN(25))
                // 1 reward sharing with 5 and a bigger stake
                .add(utils.parseUnits("1", 18).mul(new BN(50)).div(new BN(5 + 20 + 30)))
                // precision is at 10**12
                .sub(new BN("40909090909090"))
                .toString()
        );
    });

    it('test deposit in same blocks 1', async function () {
        await this.staking.connect(initialHolder).setPool(20, this.tgt.address);

        await this.tgt.connect(secondAccount).approve(this.staking.address, utils.parseUnits("10", 18));

        await this.staking.connect(secondAccount).deposit(utils.parseUnits("1", 18), secondAccount.address);

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).deposit(utils.parseUnits("8", 18), secondAccount.address);
        await this.staking.connect(secondAccount).deposit(utils.parseUnits("1", 18), secondAccount.address);
        await mintNewBlock();

        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(utils.parseUnits("1", 18));
    });

    it('test deposit in same blocks 2', async function () {
        await this.staking.connect(initialHolder).setPool(20, this.tgt.address);

        await this.tgt.connect(secondAccount).approve(this.staking.address, utils.parseUnits("10", 18));

        await this.staking.connect(secondAccount).deposit(utils.parseUnits("1", 18), secondAccount.address);

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).deposit(utils.parseUnits("1", 18), secondAccount.address);
        await this.staking.connect(secondAccount).deposit(utils.parseUnits("200", 18), secondAccount.address);
        await mintNewBlock();

        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(b1m.mul(new BN(10 - 2)).add(utils.parseUnits("1", 18)).toString());
    });

    it('test deposit and withdraw in same blocks', async function () {
        await this.staking.connect(initialHolder).setPool(20, this.tgt.address);

        await this.tgt.connect(secondAccount).approve(this.staking.address, utils.parseUnits("10", 18));

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).deposit(utils.parseUnits("10", 18), secondAccount.address);
        await this.staking.connect(secondAccount).withdraw(utils.parseUnits("10", 18), secondAccount.address);
        await mintNewBlock();

        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(utils.parseUnits("10", 18));
    });

    it('test withdraw in same blocks 1', async function () {
        await this.staking.connect(initialHolder).setPool(20, this.tgt.address);

        await this.tgt.connect(secondAccount).approve(this.staking.address, utils.parseUnits("10", 18));

        await this.staking.connect(secondAccount).deposit(utils.parseUnits("10", 18), secondAccount.address);

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).withdraw(utils.parseUnits("1", 18), secondAccount.address);
        await this.staking.connect(secondAccount).withdraw(utils.parseUnits("8", 18), secondAccount.address);
        await this.staking.connect(secondAccount).withdraw(utils.parseUnits("1", 18), secondAccount.address);
        await mintNewBlock();

        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(utils.parseUnits("10", 18).add(utils.parseUnits("1", 18)).toString());
    });

    it('test withdraw in same blocks 2', async function () {
        await this.staking.connect(initialHolder).setPool(20, this.tgt.address);

        await this.tgt.connect(secondAccount).approve(this.staking.address, utils.parseUnits("10", 18));

        await this.staking.connect(secondAccount).deposit(utils.parseUnits("10", 18), secondAccount.address);

        await network.provider.send("evm_setAutomine", [false]);
        await this.staking.connect(secondAccount).withdraw(utils.parseUnits("1", 18), secondAccount.address);
        await this.staking.connect(secondAccount).withdraw(b1m.mul(new BN(200)).toString(), secondAccount.address);
        await this.staking.connect(secondAccount).withdraw(utils.parseUnits("1", 18), secondAccount.address);
        await mintNewBlock();

        // second transaction should not have been successful so only 2 are withdrawn
        expect(await this.tgt.balanceOf(secondAccount.address)).to.equal(b1m.mul(new BN(2)).add(utils.parseUnits("1", 18)).toString());
    });
});
