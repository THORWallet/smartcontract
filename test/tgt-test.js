const {BN, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require("chai");
const {ethers} = require("hardhat");
const {setBlockTimestampInSeconds, setBlockTimestampInMonth, setBlockTimestampInMonthAndSeconds, mintNewBlock} = require("./utils/minting-blocks");

//from: https://github.com/OpenZeppelin/openzeppelin-contracts/tree/master/test/token/ERC20
const {shouldBehaveLikeERC20} = require('./utils/ERC20.behavior');
const {allowanceERC20} = require('./utils/ERC20.allowance');

let token = undefined;
let vesting = undefined;
let accounts = undefined;
let initialSupply = new BN("750000000000000000000000000");
let maxSupply = new BN("1000000000000000000000000000");

describe("TGT", function () {

    beforeEach("Should print the token name", async function () {
        const TGT = await ethers.getContractFactory("TGT");
        this.token = await TGT.deploy();
        await this.token.deployed();

        const VST = await ethers.getContractFactory("Vesting");
        this.vesting = await VST.deploy(this.token.address);
        await this.vesting.deployed();

        this.accounts = await ethers.getSigners();
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

    it('owner should be able to transfer ownership only once', async function () {
        const [_, account, anotherAccount] = this.accounts;
        expect(await this.token.transferOwner(account.address));

        await expectRevert.unspecified(this.token.transferOwner(anotherAccount.address), "TGT: not the owner");
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

    it('mint with more than the full 460m should fail', async function () {
        const [initialHolder] = this.accounts;
        let acc = new Array(initialHolder.address);
        let amount = new Array(initialSupply.toString());
        await this.token.mint(acc, amount);
        amount = new Array(new BN("1").toString());
        await expectRevert.unspecified(this.token.mint(acc, amount), "TGT: surpassing INIT_SUPPLY");
    });

    it('mint with two accounts the full 460m', async function () {
        const [initialHolder, secondAccount] = this.accounts;
        let acc = new Array(initialHolder.address, secondAccount.address);
        let amount = new Array(initialSupply.subn(1).toString(), new BN("1").toString());
        await this.token.mint(acc, amount);
        expect(await this.token.balanceOf(secondAccount.address)).to.equal("1");
    });

    it('test vesting with not enough tokens', async function () {
        const [initialHolder, secondAccount, thirdAccount, fourthAccount, fifthAccount] = this.accounts;
        let acc = new Array(initialHolder.address, secondAccount.address);
        let amount = new Array(initialSupply.subn(100).toString(), new BN("100").toString());
        await this.token.mint(acc, amount);
        await this.token.mintFinish();
        const time = await this.token.live();
        await this.token.transfer(this.vesting.address, "1000");

        let acc2 = new Array(thirdAccount.address, fourthAccount.address);
        let amount2 = new Array("300", "701");
        let duration2 = new Array(60 * 60 * 24 * 30 * 12, 60 * 60 * 24 * 30);

        await expectRevert.unspecified(this.vesting.vest(acc2, amount2, duration2));

        amount2 = new Array("300", "700");
        await this.vesting.vest(acc2, amount2, duration2);

        // 4 month later 100 should be available
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + 60 * 60 * 24 * 30 * 4]);

        await this.vesting.connect(thirdAccount).claim(fifthAccount.address, "100");
        //let bn = await this.vesting.vestedBalance();
        let acc3 = new Array(fifthAccount.address);
        let amount3 = new Array("100");
        let duration3 = new Array("1");
        await expectRevert.unspecified(this.vesting.vest(acc3, amount3, duration3));

        await this.token.transfer(this.vesting.address, "100");
        await this.vesting.vest(acc3, amount3, duration3);
    });

    //TODO: split it up
    it('test vesting', async function () {
        const [initialHolder, secondAccount, thirdAccount, fourthAccount, fifthAccount] = this.accounts;
        let acc = new Array(initialHolder.address, secondAccount.address);
        let amount = new Array(initialSupply.subn(100).toString(), new BN("100").toString());
        await this.token.mint(acc, amount);
        await this.token.mintFinish();
        const time = await this.token.live();
        //1000 tokens are now in the vesting contract
        expect(await this.vesting.canClaim(initialHolder.address)).to.equal("0");

        await setBlockTimestampInSeconds(time, 1);
        await this.token.transfer(this.vesting.address, "1000");

        await setBlockTimestampInSeconds(time, 2);
        expect(await this.vesting.canClaim(initialHolder.address)).to.equal("0");

        //call vest
        let acc2 = new Array(thirdAccount.address, fourthAccount.address);
        let amount2 = new Array("300", "700");
        let unvest2 = new Array("100", "200");
        let duration2 = new Array(60 * 60 * 24 * 30 * 12, 60 * 60 * 24 * 30);
        await setBlockTimestampInSeconds(time, 3);
        await this.vesting.vest(acc2, amount2, duration2);

        expect(await this.vesting.vestedBalanceOf(thirdAccount.address)).to.equal("300");

        //can claim
        await setBlockTimestampInMonth(time, 4);
        await mintNewBlock();
        //100 + linear -> way too small, stay at 100
        //check if we can claim
        expect(await this.vesting.canClaim(thirdAccount.address)).to.equal("100");
        await setBlockTimestampInMonthAndSeconds(time, 4, 5);
        await expectRevert.unspecified(this.vesting.connect(thirdAccount).claim(fifthAccount.address, "101"));
        await setBlockTimestampInMonthAndSeconds(time, 4, 6);
        await this.vesting.connect(thirdAccount).claim(fifthAccount.address, "1");
        await setBlockTimestampInMonthAndSeconds(time, 4, 7);

        expect(await this.vesting.vestedBalanceOf(thirdAccount.address)).to.equal("299");

        await expectRevert.unspecified(this.vesting.connect(thirdAccount).claim(fifthAccount.address, "100"));
        await setBlockTimestampInMonthAndSeconds(time, 4, 8);
        await this.vesting.connect(thirdAccount).claim(fifthAccount.address, "99");
        await setBlockTimestampInMonthAndSeconds(time, 4, 9);
        expect(await this.token.balanceOf(fifthAccount.address)).to.equal("100");
        //test linear vesting

        //one month later, we shoud have 25 tokens more
        await setBlockTimestampInMonth(time, 5);
        await expectRevert.unspecified(this.vesting.connect(thirdAccount).claim(fifthAccount.address, "26"));
        // 299 - 99 but not - 26
        expect(await this.vesting.vestedBalanceOf(thirdAccount.address)).to.equal("200");
        await setBlockTimestampInMonthAndSeconds(time, 5, 1);
        await this.vesting.connect(thirdAccount).claim(fifthAccount.address, "16");
        expect(await this.vesting.vestedBalanceOf(thirdAccount.address)).to.equal("184");
        //wait till end, claim all
        await setBlockTimestampInMonth(time, 12);
        await expectRevert.unspecified(this.vesting.connect(thirdAccount).claim(fifthAccount.address, "185"));
        await setBlockTimestampInMonthAndSeconds(time, 12, 1);
        await expectRevert.unspecified(this.vesting.connect(thirdAccount).claim(fifthAccount.address, "185"));
        await setBlockTimestampInMonthAndSeconds(time, 12, 2);
        await this.vesting.connect(thirdAccount).claim(fifthAccount.address, "184");

        expect(await this.vesting.vestedBalanceOf(thirdAccount.address)).to.equal("0");
        await expectRevert.unspecified(this.vesting.connect(thirdAccount).claim(fifthAccount.address, "1"));
    });

    it('test emit without forgetting a month', async function () {
        const [initialHolder, secondAccount, thirdAccount, fourthAccount, fifthAccount] = this.accounts;
        let acc = new Array(secondAccount.address);
        let amount = new Array(initialSupply.toString());
        await this.token.mint(acc, amount);
        await this.token.mintFinish();
        const time = await this.token.live();

        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + 1]);
        expect(await this.token.totalSupply()).to.equal(initialSupply.toString());

        // trying to emit 1 second later, should not emit
        await this.token.emitTokens();
        expect(await this.token.totalSupply()).to.equal(initialSupply.toString());

        const b50m = new BN("50000000000000000000000000");
        // after 1 Month, should emit 50m/12 and emit Transfer event
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30)]);
        expect(await this.token.emitTokens())
            .to.emit(this.token, 'Transfer').withArgs(
            "0x0000000000000000000000000000000000000000",
            initialHolder.address,
            b50m.divn(12).toString());

        expect(await this.token.totalSupply()).to.equal(initialSupply.add(b50m.divn(12)).toString());

        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30) + 1]);
        // this should not emit new tokens, after 1 month and 1 second
        await this.token.emitTokens();
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30) + 2]);
        expect(await this.token.totalSupply()).to.equal(initialSupply.add(b50m.divn(12)).toString());

        //now we emit for the next 11 month (end of feb to end of dec, jan already emitted before)
        for (let i = 2; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * i)]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b50m.divn(12).toString());
        }

        // after this year we expect 50m more (minus 8 due to rounding)
        expect(await this.token.totalSupply()).to.equal(initialSupply.add(b50m).subn(8).toString());

        const b40m = new BN("40000000000000000000000000");
        //next year 2
        for (let i = 1; i <= 12; i++) {
            // e.g. end of january 12 + 1
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (12 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b40m.divn(12).toString());
        }

        //next year 3
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (24 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b40m.divn(12).toString());
        }

        const b30m = new BN("30000000000000000000000000");
        //next year 4
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (36 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b30m.divn(12).toString());
        }

        //next year 5
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (48 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b30m.divn(12).toString());
        }

        const b20m = new BN("20000000000000000000000000");
        //next year 6
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (60 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b20m.divn(12).toString());
        }

        //next year 6
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (72 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b20m.divn(12).toString());
        }

        const b10m = new BN("10000000000000000000000000");
        //next year 7
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (84 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b10m.divn(12).toString());
        }

        // next year 8
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (96 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b10m.divn(12).toString());
        }

        // 40 due to rounding
        expect(await this.token.totalSupply()).to.equal(maxSupply.sub(new BN("40")).toString());

        // next year 9+
        // mint the last tokens which are left
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (108 + 1))]);
        await expect(this.token.emitTokens())
            .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                new BN("40").toString());

        // check total supply, should be at 1bio
        const b1b = new BN("1000000000000000000000000000");
        expect(await this.token.totalSupply()).to.equal(b1b.toString());

        // check if after one year something is emitted, should not be the case
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (120 + 1))]);
        await expect(this.token.emitTokens())
            .to.not.emit(this.token, 'Transfer');
        expect(await this.token.totalSupply()).to.equal(b1b.toString());
    });

    //split it
    it('test emit with forgetting a month', async function () {
        const [initialHolder, secondAccount, thirdAccount, fourthAccount, fifthAccount] = this.accounts;
        let acc = new Array(secondAccount.address);
        let amount = new Array(initialSupply.toString());
        await this.token.mint(acc, amount);
        await this.token.mintFinish();
        const time = await this.token.live();

        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + 1]);
        expect(await this.token.totalSupply()).to.equal(initialSupply.toString());

        // trying to emit 1 second later, should not emit
        await this.token.emitTokens();
        expect(await this.token.totalSupply()).to.equal(initialSupply.toString());

        // after 1 Month, should emit 50m/12 and emit Transfer event
        const b50m = new BN("50000000000000000000000000");
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30)]);
        expect(await this.token.emitTokens())
            .to.emit(this.token, 'Transfer').withArgs(
            "0x0000000000000000000000000000000000000000",
            initialHolder.address,
            b50m.divn(12).toString());

        expect(await this.token.totalSupply()).to.equal(initialSupply.add(b50m.divn(12)).toString());

        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30) + 1]);
        // this should not emit new tokens, after 1 month and 1 second
        await this.token.emitTokens();
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30) + 2]);
        expect(await this.token.totalSupply()).to.equal(initialSupply.add(b50m.divn(12)).toString());

        //now we emit for the next 10 month (end of march to end of dec, jan already emitted before)
        for (let i = 3; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * i)]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b50m.divn(12).toString());
        }

        // after this year we expect 50m more (minus 8 due to rounding)
        expect(await this.token.totalSupply()).to.equal(initialSupply.add(b50m).sub(b50m.divn(12)).subn(8).toString());

        const b40m = new BN("40000000000000000000000000");
        //next year 2
        for (let i = 1; i <= 12; i++) {
            // e.g. end of january 12 + 1
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (12 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b40m.divn(12).toString());
        }

        //next year 3
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (24 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b40m.divn(12).toString());
        }

        const b30m = new BN("30000000000000000000000000");
        //next year 4
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (36 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b30m.divn(12).toString());
        }

        //next year 5
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (48 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b30m.divn(12).toString());
        }

        const b20m = new BN("20000000000000000000000000");
        //next year 6
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (60 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b20m.divn(12).toString());
        }

        //next year 6
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (72 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b20m.divn(12).toString());
        }

        const b10m = new BN("10000000000000000000000000");
        //next year 7
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (84 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b10m.divn(12).toString());
        }

        // next year 8
        for (let i = 1; i <= 12; i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (96 + i))]);
            await expect(this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                    "0x0000000000000000000000000000000000000000",
                    initialHolder.address,
                    b10m.divn(12).toString());
        }

        // 40 due to rounding + 50m/12 since we forgot a month in the first year
        expect(await this.token.totalSupply()).to.equal(maxSupply.sub(new BN("40")).sub(b50m.divn(12)).toString());

        // next year 9+
        // mint the last tokens which are left
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (108 + 1))]);
        await expect(this.token.emitTokens())
            .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                new BN("40")
                    // since we forgot a month in the first year
                    .add(b50m.divn(12))
                    .toString());

        // check total supply, should be at 1bio
        const b1b = new BN("1000000000000000000000000000");
        expect(await this.token.totalSupply()).to.equal(b1b.toString());

        // check if after one year something is emitted, should not be the case
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber() + (60 * 60 * 24 * 30 * (120 + 1))]);
        await expect(this.token.emitTokens())
            .to.not.emit(this.token, 'Transfer');
        expect(await this.token.totalSupply()).to.equal(b1b.toString());
    });
});
