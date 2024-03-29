const {expect} = require("chai");
const {network, ethers} = require("hardhat");

const {loadFixture} = require("@nomicfoundation/hardhat-network-helpers");

const hre = require("hardhat");
const {getSigners} = require("@nomiclabs/hardhat-ethers/internal/helpers");
const {ether} = require("@openzeppelin/test-helpers");
const {utils} = require("ethers");

describe.only("TGT Staking", function () {

    async function deployFixture() {
        const TGTStaking = await ethers.getContractFactory("TGTStaking");
        const TGTFactory = await ethers.getContractFactory("MockTGT");
        const USDC = await ethers.getContractFactory("USDC");

        const signers = await ethers.getSigners();
        const dev = signers[0];
        const alice = signers[1];
        const bob = signers[2];
        const carol = signers[3];
        const tgtMaker = signers[4];
        const penaltyCollector = signers[5];
        const treasury = signers[6];

        const rewardToken = await USDC.deploy();
        const tgt = await TGTFactory.deploy();

        const accounts = [alice.address, bob.address, carol.address, dev.address, tgtMaker.address, penaltyCollector.address];
        const amounts = [utils.parseEther("1000"),
            utils.parseEther("1000"),
            utils.parseEther("1000"),
            utils.parseEther("0"),
            utils.parseEther("0"),
            utils.parseEther("0")];
        await tgt.mint(accounts, amounts);
        await tgt.mintFinish();

        await rewardToken.mint(
            tgtMaker.address,
            utils.parseEther("1000000")
        ); // 1_000_000 tokens

        const tgtStaking = await TGTStaking.deploy(
            rewardToken.address,
            tgt.address,
            penaltyCollector.address,
            utils.parseEther("0.03"),
            treasury.address,
            utils.parseEther("0.50")
        );

        await tgt.connect(alice).approve(tgtStaking.address, utils.parseEther("100000"));
        await tgt.connect(bob).approve(tgtStaking.address, utils.parseEther("100000"));
        await tgt.connect(carol).approve(tgtStaking.address, utils.parseEther("100000"));

        return {
            tgtStaking,
            tgt,
            rewardToken,
            dev,
            alice,
            bob,
            carol,
            tgtMaker,
            penaltyCollector,
            USDC
        };
    }

    describe("should allow deposits and withdraws", function () {


        it("should allow deposits and withdraws of multiple users", async function () {
            const {
                tgtStaking,
                tgt,
                rewardToken,
                dev,
                alice,
                bob,
                carol
            } = await loadFixture(
                deployFixture,
            );

            await tgtStaking.connect(alice).deposit(utils.parseEther("100"));

            expect(await tgt.balanceOf(alice.address)).to.be.equal(utils.parseEther("900"));
            expect(
                await tgt.balanceOf(tgtStaking.address)
            ).to.be.equal(utils.parseEther("97"));
            // 100 * 0.97 = 97
            expect((await tgtStaking.getUserInfo(
                alice.address,
                tgt.address))[0]
            ).to.be.equal(utils.parseEther("97"));

            await tgtStaking.connect(bob).deposit(utils.parseEther("200"));
            expect(await tgt.balanceOf(bob.address)).to.be.equal(
                utils.parseEther("800")
                // 97 + 200 * 0.97 = 291
            );
            expect(await tgt.balanceOf(tgtStaking.address)).to.be.equal(utils.parseEther("291"));
            expect((await tgtStaking.getUserInfo(bob.address, tgt.address))[0]).to.be.equal(utils.parseEther("194"));

            await tgtStaking
                .connect(carol)
                .deposit(utils.parseEther("300"));
            expect(await tgt.balanceOf(carol.address)).to.be.equal(
                utils.parseEther("700")
            );
            // 291 + 300 * 0.97
            expect(await tgt.balanceOf(tgtStaking.address)
            ).to.be.equal(utils.parseEther("582"));
            expect((await tgtStaking.getUserInfo(carol.address, tgt.address))[0]
            ).to.be.equal(utils.parseEther("291"));

            await tgtStaking.connect(alice).withdraw(utils.parseEther("97"));
            expect(await tgt.balanceOf(alice.address)).to.be.equal(
                utils.parseEther("997")
            );
            expect(await tgt.balanceOf(tgtStaking.address)).to.be.equal(utils.parseEther("485"));
            expect((await tgtStaking.getUserInfo(alice.address, tgt.address))[0]).to.be.equal(0);

            await tgtStaking.connect(carol).withdraw(utils.parseEther("100"));
            expect(await tgt.balanceOf(carol.address)).to.be.equal(utils.parseEther("800"));
            expect(await tgt.balanceOf(tgtStaking.address)).to.be.equal(utils.parseEther("385"));
            expect((await tgtStaking.getUserInfo(carol.address, tgt.address))[0]
            ).to.be.equal(utils.parseEther("191"));

            await tgtStaking.connect(bob).withdraw("1");
            expect(await tgt.balanceOf(bob.address)).to.be.equal(
                utils.parseEther("800.000000000000000001")
            );
            expect(
                await tgt.balanceOf(tgtStaking.address)
            ).to.be.equal(utils.parseEther("384.999999999999999999"));
            expect((
                    await tgtStaking.getUserInfo(
                        bob.address,
                        tgt.address)
                )[0]
            ).to.be.equal(utils.parseEther("193.999999999999999999"));
        });

        it("should update variables accordingly", async function () {
            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                tgtMaker
            } = await loadFixture(
                deployFixture,
            );

            await tgtStaking.connect(alice).deposit("1");

            await rewardToken.connect(tgtMaker).transfer(tgtStaking.address, utils.parseEther("1"));

            expect(await rewardToken.balanceOf(tgtStaking.address)).to.be.equal(utils.parseEther("1"));
            expect(await tgtStaking.lastRewardBalance(rewardToken.address)).to.be.equal("0");

            //increase to 7 days, as staking multiplier is 1x then.
            await increase(86400 * 7);

            expect(await tgtStaking.pendingReward(alice.address, rewardToken.address)).to.be.closeTo(
                utils.parseEther("0.5"),
                utils.parseEther("0.0001")
            );

            // Making sure that `pendingReward` still return the accurate tokens even after updating pools
            await tgtStaking.updateReward(rewardToken.address);
            expect(
                await tgtStaking.pendingReward(
                    alice.address,
                    rewardToken.address
                )
            ).to.be.closeTo(utils.parseEther("0.5"), utils.parseEther("0.0001"));

            await rewardToken.connect(tgtMaker).transfer(tgtStaking.address, utils.parseEther("1"));

            await increase(86400);

            // Should be equal to 2, the previous reward and the new one
            expect(
                await tgtStaking.pendingReward(alice.address, rewardToken.address)
            ).to.be.closeTo(utils.parseEther("1"), utils.parseEther("0.0001"));

            // Making sure that `pendingReward` still return the accurate tokens even after updating pools
            await tgtStaking.updateReward(rewardToken.address);
            expect(await tgtStaking.pendingReward(
                    alice.address,
                    rewardToken.address
                )
            ).to.be.closeTo(utils.parseEther("1"), utils.parseEther("0.0001"));
        });

        it("should return rewards with staking multiplier accordingly", async function () {
            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                tgtMaker
            } = await loadFixture(deployFixture);

            await tgtStaking.connect(alice).deposit("1");

            await rewardToken.connect(tgtMaker).transfer(tgtStaking.address, utils.parseEther("1"));

            expect(await rewardToken.balanceOf(tgtStaking.address)).to.be.equal(utils.parseEther("1"));
            expect(await tgtStaking.lastRewardBalance(rewardToken.address)).to.be.equal("0");

            //increase to 7 days, as staking multiplier is 1x then.
            await increase(86400 * 7);
            console.log("Staking multiplier is now: " + (await tgtStaking.getStakingMultiplier(alice.address)).toString());
            expect(await tgtStaking.pendingReward(alice.address, rewardToken.address)).to.be.closeTo(utils.parseEther("0.5"), utils.parseEther("0.0001"));

            // Making sure that `pendingReward` still return the accurate tokens even after updating pools
            await tgtStaking.updateReward(rewardToken.address);
            expect(
                await tgtStaking.pendingReward(
                    alice.address,
                    rewardToken.address
                )
            ).to.be.closeTo(utils.parseEther("0.5"), utils.parseEther("0.0001"));

            //increase to 6 months, as staking multiplier is 1.5x then.
            await increase(86400 * 30 * 6);
            // console.log("Staking multiplier is now: " + (await tgtStaking.getStakingMultiplier(alice.address)).toString());
            expect(await tgtStaking.pendingReward(alice.address, rewardToken.address)).to.be.closeTo(utils.parseEther("0.75"), utils.parseEther("0.0001"));

            //increase to 1 year, as staking multiplier is 2x then.
            await increase(86400 * 365);
            // console.log("Staking multiplier is now: " + (await tgtStaking.getStakingMultiplier(alice.address)).toString());
            expect(await tgtStaking.pendingReward(alice.address, rewardToken.address)).to.be.closeTo(utils.parseEther("1"), utils.parseEther("0.0001"));

            // Making sure that `pendingReward` still return the accurate tokens even after updating pools
            await tgtStaking.updateReward(rewardToken.address);
            expect(await tgtStaking.pendingReward(alice.address, rewardToken.address)
            ).to.be.closeTo(utils.parseEther("1"), utils.parseEther("0.0001"));

        });

        it("should allow deposits and withdraws of multiple users and distribute rewards accordingly", async function () {

            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                bob,
                carol,
                tgtMaker,
            } = await loadFixture(
                deployFixture,
            );

            await tgtStaking.connect(alice).deposit(utils.parseEther("100"));
            await tgtStaking.connect(bob).deposit(utils.parseEther("200"));
            await tgtStaking.connect(carol).deposit(utils.parseEther("300"));
            // console.log("Staking multiplier is now: " + (await tgtStaking.getStakingMultiplier(alice.address)).toString());
            await increase(86400 * 7);
            // console.log("Staking multiplier is now: " + (await tgtStaking.getStakingMultiplier(alice.address)).toString());

            await rewardToken.connect(tgtMaker).transfer(tgtStaking.address, utils.parseEther("6"));
            await tgtStaking.updateReward(rewardToken.address);
            // console.log("Reward pool balance: " + (await rewardToken.balanceOf(tgtStaking.address)).toString());
            console.log("Alice reward balance before claiming: " + (await rewardToken.balanceOf(alice.address)).toString());
            await tgtStaking.connect(alice).withdraw(utils.parseEther("97"));
            // console.log("Alice reward after: " + (await rewardToken.balanceOf(alice.address)).toString());

            // accRewardBalance = rewardBalance * PRECISION / totalStaked
            //                  = 6e18 * 1e24 / 582e18
            //                  = 0.010309278350515463917525e24
            // reward = accRewardBalance * aliceShare / PRECISION
            //        = accRewardBalance * 97e18 / 1e24
            //        = 0.999999999999999999e18

            expect(await rewardToken.balanceOf(alice.address)).to.be.closeTo(
                utils.parseEther("0.5"),
                utils.parseEther("0.0001")
            );

            await tgtStaking.connect(carol).withdraw(utils.parseEther("100"));
            expect(await tgt.balanceOf(carol.address)).to.be.equal(utils.parseEther("800"));
            // reward = accRewardBalance * carolShare / PRECISION
            //        = accRewardBalance * 291e18 / 1e24
            //        = 2.999999999999999999e18
            expect(
                await rewardToken.balanceOf(carol.address)
            ).to.be.closeTo(
                utils.parseEther("1.5"),
                utils.parseEther("0.0001")
            );

            await tgtStaking.connect(bob).withdraw("0");
            // reward = accRewardBalance * carolShare / PRECISION
            //        = accRewardBalance * 194e18 / 1e24
            //        = 1.999999999999999999e18
            expect(await rewardToken.balanceOf(bob.address)).to.be.closeTo(
                utils.parseEther("1"),
                utils.parseEther("0.0001")
            );
        });

        it("should distribute token accordingly even if update isn't called every day", async function () {

            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                tgtMaker,
            } = await loadFixture(
                deployFixture,
            );

            await tgtStaking.connect(alice).deposit(1);
            expect(await rewardToken.balanceOf(alice.address)).to.be.equal(0);

            await rewardToken.connect(tgtMaker).transfer(tgtStaking.address, utils.parseEther("1"));
            await increase(7 * 86400);
            await tgtStaking.connect(alice).withdraw(0);
            expect(await rewardToken.balanceOf(alice.address)).to.be.closeTo(utils.parseEther("0.5"), utils.parseEther("0.0001"));

            await rewardToken.connect(tgtMaker).transfer(tgtStaking.address, utils.parseEther("1"));
            await increase(7 * 86400);
            await tgtStaking.connect(alice).withdraw(0);
            expect(await rewardToken.balanceOf(alice.address)).to.be.closeTo(utils.parseEther("1.25"), utils.parseEther("0.0001"));
        });

        it("should allow deposits and withdraws of multiple users and distribute rewards accordingly even if someone enters or leaves", async function () {

            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                bob,
                carol,
                tgtMaker,
            } = await loadFixture(
                deployFixture,
            );

            await tgtStaking.connect(alice).deposit(utils.parseEther("100"));
            await tgtStaking.connect(carol).deposit(utils.parseEther("100"));

            await rewardToken
                .connect(tgtMaker)
                .transfer(tgtStaking.address, utils.parseEther("4"));
            await increase(86400 * 7);

            // accRewardBalance = rewardBalance * PRECISION / totalStaked
            //                  = 4e18 * 1e24 / 97e18
            //                  = 0.020618556701030927835051e24
            // bobRewardDebt = accRewardBalance * bobShare / PRECISION
            //               = accRewardBalance * 194e18 / 1e24
            //               = 0.3999999999999999999e18
            await tgtStaking.connect(bob).deposit(utils.parseEther("200")); // Bob enters


            console.log("Reward pool balance: " + (await rewardToken.balanceOf(tgtStaking.address)).toString());
            console.log("Staking multiplier for Alice: " + utils.formatEther(await tgtStaking.getStakingMultiplier(alice.address)));
            console.log("Pending reward for Alice: " + utils.formatEther((await tgtStaking.pendingReward(alice.address, rewardToken.address))));
            console.log("--------------------------------------");
            console.log("Staking multiplier for Bob: " + utils.formatEther(await tgtStaking.getStakingMultiplier(bob.address)));
            console.log("Pending reward for Bob: " + utils.formatEther(await tgtStaking.pendingReward(bob.address, rewardToken.address)));
            console.log("--------------------------------------");
            console.log("Staking multiplier for Carol: " + utils.formatEther(await tgtStaking.getStakingMultiplier(carol.address)));
            console.log("Pending reward for Carol: " + utils.formatEther(await tgtStaking.pendingReward(carol.address, rewardToken.address)));

            await tgtStaking.connect(carol).withdraw(utils.parseEther("97"));
            // reward = accRewardBalance * carolShare / PRECISION
            //        = accRewardBalance * 97e18 / 1e24
            //        = 1.999999999999999999e18
            expect(
                await rewardToken.balanceOf(carol.address)
            ).to.be.closeTo(
                utils.parseEther("1"),
                utils.parseEther("0.0001")
            );

            await tgtStaking.connect(alice).deposit(utils.parseEther("100")); // Alice enters again to try to get more rewards
            await tgtStaking.connect(alice).withdraw(utils.parseEther("194"));
            // She gets the same reward as Carol
            const aliceBalance = await rewardToken.balanceOf(alice.address);
            // aliceRewardDebt = accRewardBalance * aliceShare / PRECISION
            //        = accRewardBalance * 0 / PRECISION - 0
            //        = 0      (she withdraw everything, so her share is 0)
            // reward = accRewardBalance * aliceShare / PRECISION
            //        = accRewardBalance * 97e18 / 1e24
            //        = 1.999999999999999999e18
            expect(aliceBalance).to.be.closeTo(
                utils.parseEther("2"),
                utils.parseEther("0.0001")
            );

            await rewardToken.connect(tgtMaker).transfer(tgtStaking.address, utils.parseEther("4"));
            await increase(86400 * 10);

            await tgtStaking.connect(bob).withdraw("0");
            // reward = accRewardBalance * bobShare / PRECISION - bobRewardDebt
            //        = accRewardBalance * 194e18 / 1e24 - 3.999999999999999999e18
            //        = 4e18
            expect(await rewardToken.balanceOf(bob.address)).to.be.closeTo(
                utils.parseEther("4"),
                utils.parseEther("0.0001")
            );

            // Alice shouldn't receive any token of the last reward
            await tgtStaking.connect(alice).withdraw("0");
            // reward = accRewardBalance * aliceShare / PRECISION - aliceRewardDebt
            //        = accRewardBalance * 0 / PRECISION - 0
            //        = 0      (she withdraw everything, so her share is 0)
            expect(await rewardToken.balanceOf(alice.address)).to.be.equal(
                aliceBalance
            );
        });

        it("pending tokens function should return the same number of token that user actually receive", async function () {
            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
            } = await loadFixture(
                deployFixture,
            );

            await tgtStaking.connect(alice).deposit(utils.parseEther("300"));

            expect(await tgt.balanceOf(alice.address)).to.be.equal(utils.parseEther("700"));
            expect(await tgt.balanceOf(tgtStaking.address)).to.be.equal(utils.parseEther("291"));

            await rewardToken.mint(tgtStaking.address, utils.parseEther("100")); // We send 100 Tokens to sJoe's address

            await increase(86400 * 7);


            const pendingReward = await tgtStaking.pendingReward(alice.address, rewardToken.address);
            // console.log("pendingReward", pendingReward.toString());
            // console.log("rewardToken.balanceOf(alice.address)", (await rewardToken.balanceOf(alice.address)).toString());
            await tgtStaking.connect(alice).withdraw(0); // Alice shouldn't receive any token of the last reward
            // console.log("rewardToken.balanceOf(alice.address)", (await rewardToken.balanceOf(alice.address)).toString());
            expect(await tgt.balanceOf(alice.address)).to.be.equal(utils.parseEther("700"));
            expect(await rewardToken.balanceOf(alice.address)).to.be.equal(pendingReward);
            expect(await tgt.balanceOf(tgtStaking.address)).to.be.equal(utils.parseEther("291"));
        });

        it("should allow rewards in TGT and USDC", async function () {
            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                bob,
                carol,
            } = await loadFixture(
                deployFixture,
            );

            await tgtStaking.connect(alice).deposit(utils.parseEther("1000"));
            await tgtStaking.connect(bob).deposit(utils.parseEther("1000"));
            await tgtStaking.connect(carol).deposit(utils.parseEther("1000"));
            increase(86400 * 7);
            await rewardToken.mint(tgtStaking.address, utils.parseEther("3"));

            await tgtStaking.connect(alice).withdraw(0);
            // accRewardBalance = rewardBalance * PRECISION / totalStaked
            //                  = 3e18 * 1e24 / 291e18
            //                  = 0.001030927835051546391752e24
            // reward = accRewardBalance * aliceShare / PRECISION
            //        = accRewardBalance * 970e18 / 1e24
            //        = 0.999999999999999999e18
            // aliceRewardDebt = 0.999999999999999999e18
            const aliceRewardBalance = await rewardToken.balanceOf(alice.address);
            expect(aliceRewardBalance).to.be.closeTo(
                utils.parseEther("0.5"),
                utils.parseEther("0.0001")
            );
            // accJoeBalance = 0
            // reward = 0
            expect(await tgt.balanceOf(alice.address)).to.be.equal(0);

            await tgtStaking.addRewardToken(tgt.address);
            await tgt.mint([tgtStaking.address], [utils.parseEther("6")]);

            await tgtStaking.connect(bob).withdraw(0);
            // reward = accRewardBalance * bobShare / PRECISION
            //        = accRewardBalance * 970e18 / 1e24
            //        = 0.999999999999999999e18
            expect(await rewardToken.balanceOf(bob.address)).to.be.closeTo(
                utils.parseEther("0.5"),
                utils.parseEther("0.0001")
            );
            // accJoeBalance = tgtBalance * PRECISION / totalStaked
            //                  = 6e18 * 1e24 / 291e18
            //                  = 0.002061855670103092783505e24
            // reward = accJoeBalance * aliceShare / PRECISION
            //        = accJoeBalance * 970e18 / 1e24
            //        = 1.999999999999999999e18
            expect(await tgt.balanceOf(bob.address)).to.be.closeTo(
                utils.parseEther("1"),
                utils.parseEther("0.0001")
            );

            await tgtStaking.connect(alice).withdraw(utils.parseEther("0"));
            // reward = accRewardBalance * aliceShare / PRECISION - aliceRewardDebt
            //        = accRewardBalance * 970e18 / 1e24 - 0.999999999999999999e18
            //        = 0
            // so she has the same balance as previously
            expect(await rewardToken.balanceOf(alice.address)).to.be.equal(aliceRewardBalance);
            // reward = accJoeBalance * aliceShare / PRECISION
            //        = accJoeBalance * 970e18 / 1e24
            //        = 1.999999999999999999e18
            expect(await tgt.balanceOf(alice.address)).to.be.closeTo(
                utils.parseEther("1"),
                utils.parseEther("0.0001")
            );
        });

        it("rewardDebt should be updated after a year as expected, alice deposits before last reward is sent", async function () {

            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                bob,
                USDC
            } = await loadFixture(
                deployFixture,
            );

            let usdc = await USDC.deploy();
            await tgtStaking.addRewardToken(usdc.address);
            await tgtStaking.connect(alice).deposit(1);
            await tgtStaking.connect(bob).deposit(1);
            increase(86400 * 366);

            await usdc.mint(tgtStaking.address, utils.parseEther("100"));

            await tgtStaking.connect(alice).withdraw(1);

            let balAlice = await usdc.balanceOf(alice.address);
            let balBob = await usdc.balanceOf(bob.address);
            expect(balAlice).to.be.equal(utils.parseEther("50"));
            expect(balBob).to.be.equal(0);

            await usdc.mint(tgtStaking.address, utils.parseEther("100"));

            await tgtStaking.connect(bob).withdraw(0);
            await tgtStaking.connect(alice).deposit(1);
            increase(86400 * 366);

            balBob = await usdc.balanceOf(bob.address);
            expect(await usdc.balanceOf(alice.address)).to.be.equal(balAlice);
            expect(balBob).to.be.equal(utils.parseEther("150"));

            await usdc.mint(tgtStaking.address, utils.parseEther("100"));

            await tgtStaking.connect(bob).withdraw(0);
            await tgtStaking.connect(alice).withdraw(0);

            balAlice = await usdc.balanceOf(alice.address);
            balBob = await usdc.balanceOf(bob.address);
            expect(balAlice).to.be.equal(utils.parseEther("100"));
            expect(balBob).to.be.equal(utils.parseEther("200"));

            await tgtStaking.removeRewardToken(usdc.address);
        });

        it("rewardDebt should be updated as expected, alice deposits before last reward is sent", async function () {

            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                bob,
                USDC
            } = await loadFixture(
                deployFixture,
            );

            let usdc = await USDC.deploy();
            await tgtStaking.addRewardToken(usdc.address);
            await tgtStaking.connect(alice).deposit(1);
            await tgtStaking.connect(bob).deposit(1);
            increase(86400 * 8);

            await usdc.mint(tgtStaking.address, utils.parseEther("100"));

            await tgtStaking.connect(alice).withdraw(1);

            let balAlice = await usdc.balanceOf(alice.address);
            let balBob = await usdc.balanceOf(bob.address);
            expect(balAlice).to.be.closeTo(utils.parseEther("25"), utils.parseEther("0.0001"));
            expect(balBob).to.be.equal(0);

            await usdc.mint(tgtStaking.address, utils.parseEther("100"));
            console.log("USDC Staking balance: ", utils.formatEther(await usdc.balanceOf(tgtStaking.address)));
            console.log("Pending reward for Bob: " + utils.formatEther(await tgtStaking.pendingReward(bob.address, usdc.address)));

            //  Bob is not claiming the full reward in this step
            await tgtStaking.connect(bob).withdraw(0);
            await tgtStaking.connect(alice).deposit(1);
            increase(86400 * 8);

            balBob = await usdc.balanceOf(bob.address);
            expect(await usdc.balanceOf(alice.address)).to.be.equal(balAlice);
            //  Bob should have the full pool reward x staking multiplier 0.5x
            //1000 /2 + 25 = 75
            expect(balBob).to.be.closeTo(utils.parseEther("75"), utils.parseEther("0.0001"));


            console.log('step 3 ------------------------------------------------------------------');

            console.log("USDC Alice balance: ", utils.formatEther(await usdc.balanceOf(alice.address)));
            console.log("Staking multiplier for Alice: " + utils.formatEther(await tgtStaking.getStakingMultiplier(alice.address)));
            userInfo = await tgtStaking.getUserInfo(alice.address, rewardToken.address);
            console.log("Staking deposit for Alice: " + userInfo[0]);
            console.log("Pending reward for Alice: " + utils.formatEther(await tgtStaking.pendingReward(alice.address, usdc.address)));
            console.log("--------------------------------------");
            console.log("Staking multiplier for Bob: " + utils.formatEther(await tgtStaking.getStakingMultiplier(bob.address)));
            console.log("Pending reward for Bob: " + utils.formatEther(await tgtStaking.pendingReward(bob.address, usdc.address)));
            console.log("USDC Bob balance: ", utils.formatEther(await usdc.balanceOf(bob.address)));
            userInfo = await tgtStaking.getUserInfo(bob.address, rewardToken.address);
            console.log("Staking deposit for Bob: " + userInfo[0]);

            console.log("USDC Staking balance: ", utils.formatEther(await usdc.balanceOf(tgtStaking.address)));

            await tgtStaking.connect(bob).withdraw(0);
            await tgtStaking.connect(alice).withdraw(0);

            balAlice = await usdc.balanceOf(alice.address);
            balBob = await usdc.balanceOf(bob.address);
            expect(balAlice).to.be.closeTo(utils.parseEther("87.5"), utils.parseEther("0.0001"));
            expect(balBob).to.be.closeTo(utils.parseEther("112.5"), utils.parseEther("0.0001"));

            await tgtStaking.removeRewardToken(usdc.address);
        });

        it("rewardDebt should be updated as expected, alice deposits after last reward is sent", async function () {
            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                bob,
                USDC
            } = await loadFixture(
                deployFixture,
            );

            let token1 = await USDC.deploy();
            await tgtStaking.addRewardToken(token1.address);

            await tgtStaking.connect(alice).deposit(1);
            await tgtStaking.connect(bob).deposit(1);
            increase(86400 * 7);
            await token1.mint(
                tgtStaking.address,
                utils.parseEther("1")
            );
            await tgtStaking.connect(alice).withdraw(1);

            let balAlice = await token1.balanceOf(alice.address);
            let balBob = await token1.balanceOf(bob.address);
            expect(balAlice).to.be.equal(utils.parseEther("0.25"));
            expect(balBob).to.be.equal(0);

            await token1.mint(tgtStaking.address, utils.parseEther("1"));
            await tgtStaking.connect(bob).withdraw(0);

            balBob = await token1.balanceOf(bob.address);
            expect(await token1.balanceOf(alice.address)).to.be.equal(balAlice);
            expect(balBob).to.be.closeTo(utils.parseEther("0.75"), utils.parseEther("0.0001"));

            await token1.mint(
                tgtStaking.address,
                utils.parseEther("1")
            );
            await tgtStaking.connect(alice).deposit(1);
            await tgtStaking.connect(bob).withdraw(0);
            await tgtStaking.connect(alice).withdraw(0);

            balAlice = await token1.balanceOf(alice.address);
            balBob = await token1.balanceOf(bob.address);
            expect(await token1.balanceOf(alice.address)).to.be.equal(
                utils.parseEther("0.25")
            );
            expect(balBob).to.be.closeTo(utils.parseEther("1.25"), utils.parseEther("0.0001"));
        });

        it("should allow adding and removing a rewardToken, only by owner", async function () {
            const {
                tgtStaking,
                tgt,
                rewardToken,
                dev,
                alice,
                USDC
            } = await loadFixture(
                deployFixture,
            );

            let token1 = await USDC.deploy();
            await expect(
                tgtStaking.connect(alice).addRewardToken(token1.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
            expect(
                await tgtStaking.isRewardToken(token1.address)
            ).to.be.equal(false);
            expect(await tgtStaking.rewardTokensLength()).to.be.equal(1);

            await tgtStaking
                .connect(dev)
                .addRewardToken(token1.address);
            await expect(
                tgtStaking.connect(dev).addRewardToken(token1.address)
            ).to.be.revertedWith("TGTStaking: token can't be added");
            expect(
                await tgtStaking.isRewardToken(token1.address)
            ).to.be.equal(true);
            expect(await tgtStaking.rewardTokensLength()).to.be.equal(2);

            await tgtStaking
                .connect(dev)
                .removeRewardToken(token1.address);
            expect(
                await tgtStaking.isRewardToken(token1.address)
            ).to.be.equal(false);
            expect(await tgtStaking.rewardTokensLength()).to.be.equal(1);
        });

        it("should allow setting a new deposit fee, only by owner", async function () {
            const {
                tgtStaking,
                tgt,
                rewardToken,
                dev,
                alice,
                penaltyCollector,
            } = await loadFixture(
                deployFixture,
            );

            await tgtStaking.connect(alice).deposit(utils.parseEther("100"));
            expect(await tgt.balanceOf(alice.address)).to.be.equal(utils.parseEther("900"));
            expect(await tgt.balanceOf(tgtStaking.address)).to.be.equal(utils.parseEther("97"));
            expect(await tgt.balanceOf(penaltyCollector.address)).to.be.equal(utils.parseEther("3"));

            await expect(tgtStaking.connect(alice).setDepositFeePercent("0")
            ).to.be.revertedWith("Ownable: caller is not the owner");

            await expect(tgtStaking.connect(dev).setDepositFeePercent(utils.parseEther("0.5").add("1"))
            ).to.be.revertedWith(
                "TGTStaking: deposit fee can't be greater than 50%"
            );

            await tgtStaking.connect(dev).setDepositFeePercent(utils.parseEther("0.49"));
            expect(await tgtStaking.depositFeePercent()).to.be.equal(
                utils.parseEther("0.49")
            );

            await tgtStaking.connect(alice).deposit(utils.parseEther("100"));
            expect(await tgt.balanceOf(alice.address)).to.be.equal(utils.parseEther("800"));

            expect(await tgt.balanceOf(tgtStaking.address)).to.be.equal(
                utils.parseEther("97").add(utils.parseEther("51"))
            );
            expect(await tgt.balanceOf(penaltyCollector.address)
            ).to.be.equal(
                utils.parseEther("3").add(utils.parseEther("49"))
            );
        });

        it("should allow emergency withdraw", async function () {

            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
            } = await loadFixture(
                deployFixture,
            );

            await tgtStaking.connect(alice).deposit(utils.parseEther("300"));
            expect(await tgt.balanceOf(alice.address)).to.be.equal(utils.parseEther("700"));
            expect(await tgt.balanceOf(tgtStaking.address)).to.be.equal(utils.parseEther("291"));

            await rewardToken.mint(tgtStaking.address, utils.parseEther("100")); // We send 100 Tokens to sJoe's address

            await tgtStaking.connect(alice).emergencyWithdraw(); // Alice shouldn't receive any token of the last reward
            expect(await tgt.balanceOf(alice.address)).to.be.equal(
                utils.parseEther("991")
            );
            expect(await rewardToken.balanceOf(alice.address)).to.be.equal(0);
            expect(await tgt.balanceOf(tgtStaking.address)).to.be.equal(0);
            const userInfo = await tgtStaking.getUserInfo(alice.address, rewardToken.address);
            expect(userInfo[0]).to.be.equal(0);
            expect(userInfo[1]).to.be.equal(0);
        });

        it("should properly calculate and distribute rewards for multiple users in different time periods ", async function () {

            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                dev,
                bob,
                carol,
                tgtMaker
            } = await loadFixture(
                deployFixture,
            );
            await tgtStaking.connect(dev).setDepositFeePercent(utils.parseEther("0"));

            await tgtStaking.connect(alice).deposit(utils.parseEther("100"));
            await tgtStaking.connect(carol).deposit(utils.parseEther("100"));

            await increase(86400 * 365);
            await tgtStaking.connect(bob).deposit(utils.parseEther("100")); // Bob enters
            await increase(86400 * 10);
            await rewardToken.connect(tgtMaker).transfer(tgtStaking.address, utils.parseEther("100"));

            // alice = 100 1 year = 2x
            // bob= 100 7 days = 1x
            // carol = 100 7 days = 1x
            // share = totalRewardBalance 100 / 4x = 25
            // alice = 2 x share = 50

            console.log("Reward pool balance: ", utils.formatEther(await rewardToken.balanceOf(tgtStaking.address)));
            console.log("accRewardPerShare: ", utils.formatEther(await tgtStaking.accRewardPerShare(rewardToken.address)));

            console.log("Staking multiplier for Alice: " + utils.formatEther(await tgtStaking.getStakingMultiplier(alice.address)));
            console.log("Pending reward for Alice: " + utils.formatEther((await tgtStaking.pendingReward(alice.address, rewardToken.address))));
            console.log("--------------------------------------");
            console.log("Staking multiplier for Bob: " + utils.formatEther(await tgtStaking.getStakingMultiplier(bob.address)));
            console.log("Pending reward for Bob: " + utils.formatEther(await tgtStaking.pendingReward(bob.address, rewardToken.address)));
            console.log("--------------------------------------");
            console.log("Staking multiplier for Carol: " + utils.formatEther(await tgtStaking.getStakingMultiplier(carol.address)));
            console.log("Pending reward for Carol: " + utils.formatEther(await tgtStaking.pendingReward(carol.address, rewardToken.address)));
            console.log("--------------------------------------");

            await tgtStaking.connect(alice).withdraw(utils.parseEther("0"));
            expect(await rewardToken.balanceOf(alice.address)).to.be.closeTo(
                utils.parseEther("33.3333"),
                utils.parseEther("0.0001")
            );
            await tgtStaking.connect(bob).withdraw(utils.parseEther("0"));
            expect(await rewardToken.balanceOf(bob.address)).to.be.closeTo(
                utils.parseEther("16.6666"),
                utils.parseEther("0.0001")
            );
            await tgtStaking.connect(carol).withdraw(utils.parseEther("0"));
            expect(await rewardToken.balanceOf(carol.address)).to.be.closeTo(
                utils.parseEther("33.3333"),
                utils.parseEther("0.0001")
            )

            expect(await tgtStaking.pendingReward(alice.address, rewardToken.address)).to.be.equal(utils.parseEther("0"));
            expect(await tgtStaking.pendingReward(bob.address, rewardToken.address)).to.be.equal(utils.parseEther("0"));
            expect(await tgtStaking.pendingReward(carol.address, rewardToken.address)).to.be.equal(utils.parseEther("0"));

            await increase(86400 * 365);
            await rewardToken.connect(tgtMaker).transfer(tgtStaking.address, utils.parseEther("100"));


            console.log("Staking multiplier for Alice: " + utils.formatEther(await tgtStaking.getStakingMultiplier(alice.address)));
            console.log("Pending reward for Alice: " + utils.formatEther((await tgtStaking.pendingReward(alice.address, rewardToken.address))));
            console.log("--------------------------------------");
            console.log("Staking multiplier for Bob: " + utils.formatEther(await tgtStaking.getStakingMultiplier(bob.address)));
            console.log("Pending reward for Bob: " + utils.formatEther(await tgtStaking.pendingReward(bob.address, rewardToken.address)));
            console.log("--------------------------------------");
            console.log("Staking multiplier for Carol: " + utils.formatEther(await tgtStaking.getStakingMultiplier(carol.address)));
            console.log("Pending reward for Carol: " + utils.formatEther(await tgtStaking.pendingReward(carol.address, rewardToken.address)));
            console.log("--------------------------------------");

            await tgtStaking.connect(bob).withdraw(utils.parseEther("0"));
            await tgtStaking.connect(alice).withdraw(utils.parseEther("0"));
            await tgtStaking.connect(carol).withdraw(utils.parseEther("0"));

            expect(await rewardToken.balanceOf(alice.address)).to.be.closeTo(
                utils.parseEther("66.66"),
                utils.parseEther("0.01")
            );
            expect(await rewardToken.balanceOf(bob.address)).to.be.closeTo(
                utils.parseEther("66.66"),
                utils.parseEther("0.01")
            );
            expect(await rewardToken.balanceOf(carol.address)).to.be.closeTo(
                utils.parseEther("66.66"),
                utils.parseEther("0.01")
            )
            console.log("Reward balance after all withdrawals: ", utils.formatEther(await rewardToken.balanceOf(tgtStaking.address)));
            console.log("Reward balance Alice: ", utils.formatEther(await rewardToken.balanceOf(alice.address)));
            console.log("Reward balance Bob: ", utils.formatEther(await rewardToken.balanceOf(bob.address)));
            console.log("Reward balance Carol: ", utils.formatEther(await rewardToken.balanceOf(carol.address)));

        });

        it.skip("should calculate rewards correctly when the number of depositors is >= 200", async function () {

            const {
                tgtStaking,
                tgt,
                rewardToken,
                alice,
                dev,
                bob,
                carol,
                tgtMaker
            } = await loadFixture(
                deployFixture,
            );
            await tgtStaking.connect(dev).setDepositFeePercent(utils.parseEther("0"));

            const signers = await ethers.getSigners();

            for (let i = 0; i < 200; i++) {
                const signer = new ethers.Wallet.createRandom().connect(ethers.provider);
                await dev.sendTransaction({to: signer.address, value: utils.parseEther("0.1")});
                await tgt.connect(dev).mint2(signer.address, utils.parseEther("100"));
                await tgt.connect(signer).approve(tgtStaking.address, utils.parseEther("1000"));
                await tgtStaking.connect(signer).deposit(utils.parseEther("100"));
            }

            await tgtStaking.connect(alice).deposit(utils.parseEther("100"));
            await tgtStaking.connect(carol).deposit(utils.parseEther("100"));

            await increase(86400 * 365);
            await tgtStaking.connect(bob).deposit(utils.parseEther("100")); // Bob enters
            await increase(86400 * 10);
            await rewardToken.connect(tgtMaker).transfer(tgtStaking.address, utils.parseEther("100"));

            console.log("Reward pool balance: ", utils.formatEther(await rewardToken.balanceOf(tgtStaking.address)));

            console.log("Staking multiplier for Alice: " + utils.formatEther(await tgtStaking.getStakingMultiplier(alice.address)));
            console.log("Pending reward for Alice: " + utils.formatEther((await tgtStaking.pendingReward(alice.address, rewardToken.address))));
            console.log("--------------------------------------");
            console.log("Staking multiplier for Bob: " + utils.formatEther(await tgtStaking.getStakingMultiplier(bob.address)));
            console.log("Pending reward for Bob: " + utils.formatEther(await tgtStaking.pendingReward(bob.address, rewardToken.address)));
            console.log("--------------------------------------");
            console.log("Staking multiplier for Carol: " + utils.formatEther(await tgtStaking.getStakingMultiplier(carol.address)));
            console.log("Pending reward for Carol: " + utils.formatEther(await tgtStaking.pendingReward(carol.address, rewardToken.address)));
            console.log("--------------------------------------");

            await tgtStaking.connect(alice).withdraw(utils.parseEther("0"));
            await tgtStaking.connect(bob).withdraw(utils.parseEther("0"));
            await tgtStaking.connect(carol).withdraw(utils.parseEther("0"));

            expect(await tgtStaking.pendingReward(alice.address, rewardToken.address)).to.be.equal(utils.parseEther("0"));
            expect(await tgtStaking.pendingReward(bob.address, rewardToken.address)).to.be.equal(utils.parseEther("0"));
            expect(await tgtStaking.pendingReward(carol.address, rewardToken.address)).to.be.equal(utils.parseEther("0"));

        }).timeout(1000000);


    });

    after(async function () {
        await network.provider.request({
            method: "hardhat_reset",
            params: [],
        });
    });
})
;

const increase = (seconds) => {
    ethers.provider.send("evm_increaseTime", [seconds]);
    ethers.provider.send("evm_mine", []);
};