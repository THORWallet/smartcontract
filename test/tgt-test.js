const {BN, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require("chai");
const hre = require("hardhat");

//from: https://github.com/OpenZeppelin/openzeppelin-contracts/tree/master/test/token/ERC20
const {shouldBehaveLikeERC20} = require('./utils/ERC20.behavior');
const {allowanceERC20} = require('./utils/ERC20.allowance');

let token = undefined;
let vesting = undefined;
let accounts = undefined;
let initialSupply = new BN("460000000000000000000000000");

describe("TGT", function () {

    beforeEach("Should print the token name", async function () {
        const TGT = await ethers.getContractFactory("TGT");
        this.token = await TGT.deploy();
        await this.token.deployed();

        const VST = await ethers.getContractFactory("Vesting");
        this.vesting = await VST.deploy(this.token.address);
        await this.vesting.deployed();

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

    it('mint with two accounts the full 460m', async function () {
        const [initialHolder, secondAccount] = this.accounts;
        let acc = new Array(initialHolder.address, secondAccount.address);
        let amount = new Array(initialSupply.subn(1).toString(), new BN("1").toString());
        await this.token.mint(acc, amount);
        expect(await this.token.balanceOf(secondAccount.address)).to.equal("1");
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

        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+1]);
        await this.token.transfer(this.vesting.address, "1000");

        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+2]);
        expect(await this.vesting.canClaim(initialHolder.address)).to.equal("0");

        //call vest
        let acc2 = new Array(thirdAccount.address, fourthAccount.address);
        let amount2 = new Array("300", "700");
        let cliff2 = new Array("100", "200");
        let duration2 = new Array(60*60*24*30*12, 60*60*24*30);
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+3]);
        await this.vesting.vest(acc2, amount2, cliff2, duration2);
        //can claim
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+4]);
        //100 + linear -> way too small, stay at 100
        expect(await this.vesting.canClaim(thirdAccount.address)).to.equal("100");
        //chekc if we can claim
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+5]);
        await expectRevert.unspecified(this.vesting.connect(thirdAccount).claim(fifthAccount.address, "101"));
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+6]);
        await this.vesting.connect(thirdAccount).claim(fifthAccount.address, "1");
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+7]);
        await expectRevert.unspecified(this.vesting.connect(thirdAccount).claim(fifthAccount.address, "100"));
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+8]);
        await this.vesting.connect(thirdAccount).claim(fifthAccount.address, "99");
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+9]);
        expect(await this.token.balanceOf(fifthAccount.address)).to.equal("100");
        //test linear vesting

        //one month later, we shoud have 16 tokens more
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30)]);
        await expectRevert.unspecified(this.vesting.connect(thirdAccount).claim(fifthAccount.address, "17"));
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+1+(60*60*24*30)]);
        await this.vesting.connect(thirdAccount).claim(fifthAccount.address, "16");
        //wait till end, claim all
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*12)]);
        await expectRevert.unspecified(this.vesting.connect(thirdAccount).claim(fifthAccount.address, "185"));
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+1+(60*60*24*30*12)]);
        await this.vesting.connect(thirdAccount).claim(fifthAccount.address, "184");
    });

    //split it
    it('test emit', async function () {
        const [initialHolder, secondAccount, thirdAccount, fourthAccount, fifthAccount] = this.accounts;
        let acc = new Array(secondAccount.address);
        let amount = new Array(initialSupply.toString());
        await this.token.mint(acc, amount);
        await this.token.mintFinish();
        const time = await this.token.live();

        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+1]);
        expect(await this.token.totalSupply()).to.equal(initialSupply.toString());

        //after 1 Month, should be 15m
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30)]);
        expect(await this.token.emitTokens())
            .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
            initialHolder.address,
            "15000000000000000000000000");


        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30)+1]);
        //this does not emit new tokens
        await this.token.emitTokens();
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30)+2]);
        const b15m = new BN("15000000000000000000000000");
        expect(await this.token.totalSupply()).to.equal(initialSupply.add(b15m).toString());

        //now we forget on month and go to month 3 to 12, so we miss minting 15m
        for(let i=2;i<12;i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*i)]);
            expect(await this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                b15m.toString());
        }
        //for this year 180m, we missed 15m
        const b180m = new BN("180000000000000000000000000");
        expect(await this.token.totalSupply()).to.equal(initialSupply.add(b180m.sub(b15m)).toString());

        const b10m = new BN("10000000000000000000000000");
        //next year 2
        for(let i=0;i<12;i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*(12+i))]);
            expect(await this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                b10m.toString());
        }

        const b6m = new BN("6666666666666666666666666");
        //next year 3
        for(let i=0;i<12;i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*(24+i))]);
            expect(await this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                b6m.toString());
        }

        //const b6m = new BN("6666666666666666666666666");
        //next year 4
        for(let i=0;i<12;i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*(36+i))]);
            expect(await this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                b6m.toString());
        }

        const b3m = new BN("3333333333333333333333333");
        //next year 5
        for(let i=0;i<12;i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*(48+i))]);
            expect(await this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                b3m.toString());
        }

        const b1p6m = new BN("1666666666666666666666666");
        //next year 5
        for(let i=0;i<12;i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*(60+i))]);
            expect(await this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                b1p6m.toString());
        }

        const b8p3m = new BN("833333333333333333333333");
        //next year 6
        for(let i=0;i<12;i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*(72+i))]);
            expect(await this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                b8p3m.toString());
        }

        const b4p6m = new BN("416666666666666666666666");
        //next year 7
        for(let i=0;i<12;i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*(84+i))]);
            expect(await this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                b4p6m.toString());
        }

        //const b4p6m = new BN("416666666666666666666666");
        //next year 8
        for(let i=0;i<12;i++) {
            await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*(96+i))]);
            expect(await this.token.emitTokens())
                .to.emit(this.token, 'Transfer').withArgs(
                "0x0000000000000000000000000000000000000000",
                initialHolder.address,
                b4p6m.toString());
        }

        const b15pm = new BN("15000000000000000000000048"); //48 due to rounding
        //next year 9+
        //mint the last tokens we forget during monthl minitng
        await ethers.provider.send('evm_setNextBlockTimestamp', [time.toNumber()+(60*60*24*30*(109))]);
        expect(await this.token.emitTokens())
            .to.emit(this.token, 'Transfer').withArgs(
            "0x0000000000000000000000000000000000000000",
            initialHolder.address,
            b15pm.toString());

        //check total supply
        const b1b = new BN("1000000000000000000000000000");
        expect(await this.token.totalSupply()).to.equal(b1b.toString());
    });
});
