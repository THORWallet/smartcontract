const hre = require("hardhat");
const {expect} = require("chai");
const {expectRevert, BN} = require("@openzeppelin/test-helpers");
const {MerkleTree} = require("merkletreejs");

let initialSupply = new BN("750000000000000000000000000");

const rewards = [
    {address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", amount: 100},
    {address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: 101},
    {address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", amount: 102},
    {address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", amount: 103},
]

const hash = (s) => {
    return Buffer.from(hre.ethers.utils.keccak256(s).slice('0x'.length), 'hex')
}

const toTGTDecimals = (n) => {
    return new BN(n).mul(new BN('10').pow(new BN('18')))
}


describe("Distributor", function () {

    beforeEach("Setup", async function () {
        this.accounts = await hre.ethers.getSigners();
        const [initialHolder] = this.accounts;
        this.initialHolder = initialHolder;


        const TGT = await hre.ethers.getContractFactory("TGT");
        this.token = await TGT.deploy();
        await this.token.deployed();

        const Distributor = await hre.ethers.getContractFactory("Distributor");
        this.distributor = await Distributor.deploy(this.token.address, this.initialHolder.address, "0x0000000000000000000000000000000000000000000000000000000000000000" );
        await this.distributor.deployed();

        let amount = new Array(initialSupply.toString());
        let acc = new Array(initialHolder.address);
        await this.token.mint(acc, amount);
        await this.token.mintFinish();
        await this.token.connect(initialHolder).approve(this.distributor.address, initialSupply.toString())
    });

    it('Should be able to update merkle root', async function () {
        const merkleLeaves = rewards.map((data) => hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [data.address, data.amount]),
        ));
        const merkleTree = new MerkleTree(merkleLeaves, hash, {sortPairs: true});
        const root =  merkleTree.getRoot().toString('hex')
        await this.distributor.updateMerkleRoot("0x" + root)
    });

    it('Should be able to verify claimable amount', async function () {
        const [,secondAccount] = this.accounts;
        const merkleLeaves = rewards.map((data) => hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [data.address, data.amount]),
        ));
        const merkleTree = new MerkleTree(merkleLeaves, hash, {sortPairs: true});
        const root =  merkleTree.getRoot().toString('hex')

        const {address, amount} = rewards[1]
        const proof = merkleTree.getProof(hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [address, amount]),
        )).map((p) => '0x' + p.data.toString('hex'));
        await this.distributor.updateMerkleRoot("0x" + root)

        const claimable = await this.distributor.connect(secondAccount).claimableAmount(address, amount, proof)
        expect(claimable).to.equal(amount);
    });

    it('Should be able to claim', async function () {
        const [,secondAccount] = this.accounts;
        const merkleLeaves = rewards.map((data) => hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [data.address, data.amount]),
        ));
        const merkleTree = new MerkleTree(merkleLeaves, hash, {sortPairs: true});
        const root =  merkleTree.getRoot().toString('hex')

        const {address, amount} = rewards[1]
        const proof = merkleTree.getProof(hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [address, amount]),
        )).map((p) => '0x' + p.data.toString('hex'));
        await this.distributor.updateMerkleRoot("0x" + root)

        await this.distributor.connect(secondAccount).claim(address, amount, proof)
        expect(await this.distributor.amountClaimed(secondAccount.address)).to.equal(amount);
        const balance = await this.token.balanceOf(secondAccount.address)
        expect(balance.toString()).to.equal(toTGTDecimals(amount).toString());
    });

    it('Should not be able to claim twice', async function () {
        const [,secondAccount] = this.accounts;
        const merkleLeaves = rewards.map((data) => hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [data.address, data.amount]),
        ));
        const merkleTree = new MerkleTree(merkleLeaves, hash, {sortPairs: true});
        const root =  merkleTree.getRoot().toString('hex')

        const {address, amount} = rewards[1]
        const proof = merkleTree.getProof(hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [address, amount]),
        )).map((p) => '0x' + p.data.toString('hex'));
        await this.distributor.updateMerkleRoot("0x" + root)


        await this.distributor.connect(secondAccount).claim(address, amount, proof)
        await expectRevert.unspecified(this.distributor.connect(secondAccount).claim(address, amount, proof), "Distributor: no more TGT to claim.");
        expect(await this.distributor.amountClaimed(secondAccount.address)).to.equal(amount);
        const balance = await this.token.balanceOf(secondAccount.address)
        expect(balance.toString()).to.equal(toTGTDecimals(amount).toString());
    });

    it('Should be able to claim again after merkle root update', async function () {
        const [,,thirdAccount] = this.accounts;
        const merkleLeaves = rewards.map((data) => hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [data.address, data.amount]),
        ));
        const merkleTree = new MerkleTree(merkleLeaves, hash, {sortPairs: true});
        const root =  merkleTree.getRoot().toString('hex')

        const {address, amount} = rewards[2]
        const proof = merkleTree.getProof(hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [address, amount]),
        )).map((p) => '0x' + p.data.toString('hex'));
        await this.distributor.updateMerkleRoot("0x" + root)


        await this.distributor.connect(thirdAccount).claim(address, amount, proof)
        expect(await this.distributor.amountClaimed(thirdAccount.address)).to.equal(amount);
        const balance = await this.token.balanceOf(thirdAccount.address)
        expect(balance.toString()).to.equal(toTGTDecimals(amount).toString());

        // increase reward for third address
        const modifiedRewards = rewards.map(({address: addr, amount:amnt}) => addr === address? {address: addr, amount: amnt+100}: {address: addr, amount: amnt})
        const {amount: amountUpdated} = modifiedRewards[2]
        const merkleLeavesUpdated = modifiedRewards.map((data) => hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [data.address, data.amount]),
        ));
        const merkleTreeUpdated = new MerkleTree(merkleLeavesUpdated, hash, {sortPairs: true});
        const rootUpdated =  merkleTreeUpdated.getRoot().toString('hex')
        await this.distributor.updateMerkleRoot("0x" + rootUpdated)
        const proofUpdated = merkleTreeUpdated.getProof(hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [address, amountUpdated]),
        )).map((p) => '0x' + p.data.toString('hex'));

        await this.distributor.connect(thirdAccount).claim(address, amountUpdated, proofUpdated)
        expect(await this.distributor.amountClaimed(thirdAccount.address)).to.equal(amountUpdated);
        const balanceUpdated = await this.token.balanceOf(thirdAccount.address)
        expect(balanceUpdated.toString()).to.equal(toTGTDecimals(amountUpdated).toString());
    });

    it('Should not be able to claim higher amount than available', async function () {
        const [,secondAccount] = this.accounts;
        const merkleLeaves = rewards.map((data) => hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [data.address, data.amount]),
        ));
        const merkleTree = new MerkleTree(merkleLeaves, hash, {sortPairs: true});
        const root =  merkleTree.getRoot().toString('hex')

        const {address, amount} = rewards[1]
        const proof = merkleTree.getProof(hash(
            hre.ethers.utils.solidityPack(["address", "uint32"], [address, amount]),
        )).map((p) => '0x' + p.data.toString('hex'));
        await this.distributor.updateMerkleRoot("0x" + root)

        await expectRevert.unspecified(this.distributor.connect(secondAccount).claim(address, amount+1, proof), "Distributor: Invalid proof.");
        expect(await this.distributor.amountClaimed(secondAccount.address)).to.equal(0);
        const balance = await this.token.balanceOf(secondAccount.address)
        expect(balance).to.equal(0);
    });
});
