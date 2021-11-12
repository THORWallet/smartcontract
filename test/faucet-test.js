const hre = require("hardhat");
const {expect} = require("chai");
const {expectRevert, BN} = require("@openzeppelin/test-helpers");


let token = undefined;
let faucet = undefined;
let accounts = undefined;
const INIT_SUPPLY = new BN("750000000000000000000000000");
const ETH1 = new BN("1000000000000000000");
const ETH2 = new BN("2000000000000000000");

describe("TGT", function () {

    beforeEach("Setup TGT and Faucet contracts", async function () {
        this.accounts = await hre.ethers.getSigners();

        const TGT = await ethers.getContractFactory("TGT");
        this.token = await TGT.deploy();
        await this.token.deployed();

        const FAUCET = await ethers.getContractFactory("Faucet");
        this.faucet = await FAUCET.deploy(this.token.address, this.accounts[0].address, ETH1.toString());
        await this.faucet.deployed();

        //set token live
        let acc = new Array(this.accounts[0].address);
        let amount = new Array(INIT_SUPPLY.toString());
        await this.token.mint(acc, amount);
        await this.token.mintFinish();
    });

    it('Check token', async function () {
        expect(await this.token.name()).to.equal("THORWallet Governance Token");
    });

    it('Faucet spender not approved', async function () {
        await expectRevert.unspecified(this.faucet.connect(this.accounts[1]).claim(), "TGT: not the owner");
    });

    it('Approve faucet spender', async function () {
        expect(await this.token.approve(this.faucet.address, ETH2.toString()))
            .to.emit(this.token, 'Approval').withArgs(this.accounts[0].address, this.faucet.address, ETH2.toString());
    });

    it('Faucet spender approved', async function () {
        await this.token.approve(this.faucet.address, ETH2.toString());
        expect(await this.faucet.connect(this.accounts[1]).claim())
            .to.emit(this.faucet, 'Claim').withArgs(this.accounts[1].address, ETH1.toString());
    });

    it('Faucet spender approved twice does not work', async function () {
        await this.token.approve(this.faucet.address, ETH2.toString());
        await this.faucet.connect(this.accounts[1]).claim();
        await expectRevert.unspecified(this.faucet.connect(this.accounts[1]).claim(), "TGT: not the owner");
    });

    it('Other spender approved', async function () {
        await this.token.approve(this.faucet.address, ETH2.toString());
        await this.faucet.connect(this.accounts[1]).claim();
        expect(await this.faucet.connect(this.accounts[2]).claim())
            .to.emit(this.faucet, 'Claim').withArgs(this.accounts[2].address, ETH1.toString());
    });

    it('Out of funds', async function () {
        await this.token.approve(this.faucet.address, ETH2.toString());
        await this.faucet.connect(this.accounts[1]).claim();
        await this.faucet.connect(this.accounts[2]).claim();
        await expectRevert.unspecified(this.faucet.connect(this.accounts[3]).claim(), "TGT: not the owner");
    });
});
