const hre = require("hardhat");
const {expect} = require("chai");
const {expectRevert, BN} = require("@openzeppelin/test-helpers");


let token = undefined;
let batchTransfer = undefined;
let accounts = undefined;
const INIT_SUPPLY = new BN("750000000000000000000000000");
const ETH1 = new BN("1000000000000000000");
const ETH2 = new BN("2000000000000000000");
const ETH5 = new BN("5000000000000000000");

describe("BatchTransfer Test", function () {

    beforeEach("Setup TGT and BatchTransfer contracts", async function () {
        this.accounts = await hre.ethers.getSigners();

        const TGT = await ethers.getContractFactory("TGT");
        this.token = await TGT.deploy();
        await this.token.deployed();

        const BATCHTRANSFER = await ethers.getContractFactory("BatchTransfer");
        this.batchTransfer = await BATCHTRANSFER.deploy();
        await this.batchTransfer.deployed();

        //set token live
        let acc = new Array(this.accounts[0].address);
        let amount = new Array(INIT_SUPPLY.toString());
        await this.token.mint(acc, amount);
        await this.token.mintFinish();
    });

    it('Check token', async function () {
        expect(await this.token.name()).to.equal("THORWallet Governance Token");
    });

    it('Send to one address', async function () {
        console.log(this.accounts[1].address);
        await this.token.transfer(this.batchTransfer.address, ETH1.toString());
        await this.batchTransfer.batchTransferDirect(this.token.address, [this.accounts[1].address], ETH1.toString());
        expect(await this.token.balanceOf(this.accounts[1].address)).to.equal(ETH1.toString());
    });

    it('Send to 2 addresses', async function () {
        await this.token.transfer(this.batchTransfer.address, ETH2.toString());
        await this.batchTransfer.batchTransferDirect(this.token.address, [this.accounts[1].address, this.accounts[2].address], ETH1.toString());
        expect(await this.token.balanceOf(this.accounts[1].address)).to.equal(ETH1.toString());
        expect(await this.token.balanceOf(this.accounts[2].address)).to.equal(ETH1.toString());
    });

});
