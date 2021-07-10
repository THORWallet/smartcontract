const { expect } = require("chai");

let tgt = undefined;
describe("TGT", function () {
    beforeEach("Should print the token name", async function () {
        const TGT = await ethers.getContractFactory("TGT");
        this.tgt = await TGT.deploy();
        await this.tgt.deployed();

        const name = await this.tgt.name();
        expect(name).to.equal("THORWallet Governance Token");
    });

    it("mints tokens", async function() {
        console.log("test");
    });
});