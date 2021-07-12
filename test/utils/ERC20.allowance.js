const {BN, constants, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');
const {ZERO_ADDRESS} = constants;

function allowanceERC20(errorPrefix, initialSupply, initialHolder, recipient, anotherAccount, token) {

    const spender = recipient.address;
    describe('decrease allowance', function () {

        describe('when the sender has enough balance', function () {
            const amount = initialSupply;

            shouldDecreaseApproval(amount, token);
        });

        describe('when the sender does not have enough balance', function () {
            const amount = initialSupply.addn(1);

            shouldDecreaseApproval(amount, token);
        });

        function shouldDecreaseApproval(initialSupply, token) {
            amount = initialSupply.toString()
            describe('when there was no approved amount before', function () {
                it('reverts', async function () {
                    await expectRevert.unspecified(token.connect(initialHolder).decreaseAllowance(
                        spender, amount), 'ERC20: decreased allowance below zero',
                    );
                });
            });

            describe('when the spender had an approved amount', function () {
                const approvedAmount = amount;

                beforeEach(async function () {
                    await token.connect(initialHolder).approve(spender, approvedAmount);
                });

                it('emits an approval event', async function () {
                    expect(await token.connect(initialHolder).decreaseAllowance(spender, approvedAmount)).to.emit(token, 'Approval').withArgs(initialHolder.address, spender, '0');
                });

                it('decreases the spender allowance subtracting the requested amount', async function () {
                    await token.connect(initialHolder).decreaseAllowance(spender, initialSupply.subn(1).toString());

                    expect((await token.allowance(initialHolder.address, spender)).toString()).to.be.bignumber.equal('1');
                });

                it('sets the allowance to zero when all allowance is removed', async function () {
                    await token.connect(initialHolder).decreaseAllowance(spender, approvedAmount);
                    expect((await token.allowance(initialHolder.address, spender)).toString()).to.be.bignumber.equal('0');
                });

                it('reverts when more than the full allowance is removed', async function () {
                    await expectRevert.unspecified(
                        token.connect(initialHolder).decreaseAllowance(spender, initialSupply.addn(1).toString()),
                        'ERC20: decreased allowance below zero',
                    );
                });
            });
        }

        describe('when the spender is the zero address', function () {
            const amount = initialSupply.toString();
            const spender = ZERO_ADDRESS;

            it('reverts', async function () {
                await expectRevert.unspecified(token.connect(initialHolder).decreaseAllowance(
                    spender, amount), 'ERC20: decreased allowance below zero',
                );
            });

            it('set allowance to 0', async function () {
                await token.connect(initialHolder).approve(recipient.address, '0');
            });
        });
    });

    describe('increase allowance', function () {
        const amount = initialSupply;

        describe('when the spender is not the zero address', function () {
            const spender = recipient.address;

            describe('when the sender has enough balance', function () {
                it('emits an approval event', async function () {
                    expect(await token.connect(initialHolder).increaseAllowance(spender, amount.toString()))
                        .to.emit(token, 'Approval').withArgs(initialHolder.address, spender, amount.toString());
                });



                describe('when there was no approved amount before', function () {
                    beforeEach('set allowance to 0', async function () {
                        await token.connect(initialHolder).approve(recipient.address, '0');
                    });

                    it('approves the requested amount', async function () {
                        await token.connect(initialHolder).increaseAllowance(spender, amount.toString());

                        expect((await token.allowance(initialHolder.address, spender)).toString()).to.be.bignumber.equal(amount);
                    });
                });

                describe('when the spender had an approved amount', function () {
                    beforeEach(async function () {
                        await token.connect(initialHolder).approve(spender, new BN(1).toString());
                    });

                    it('increases the spender allowance adding the requested amount', async function () {
                        await token.connect(initialHolder).increaseAllowance(spender, amount.toString());

                        expect((await token.allowance(initialHolder.address, spender)).toString()).to.be.bignumber.equal(amount.addn(1));
                    });
                });
            });

            describe('when the sender does not have enough balance', function () {
                const amount = initialSupply.addn(1);

                beforeEach('set allowance to 0', async function () {
                    await token.connect(initialHolder).approve(recipient.address, '0');
                });

                it('emits an approval event', async function () {
                    expect(await token.connect(initialHolder).increaseAllowance(spender, amount.toString()))
                        .to.emit(token, 'Approval').withArgs(initialHolder.address, spender, amount.toString())
                });

                describe('when there was no approved amount before', function () {
                    beforeEach('set allowance to 0', async function () {
                        await token.connect(initialHolder).approve(recipient.address, '0');
                    });

                    it('approves the requested amount', async function () {
                        await token.connect(initialHolder).increaseAllowance(spender, amount.toString());

                        expect((await token.allowance(initialHolder.address, spender)).toString()).to.be.bignumber.equal(amount);
                    });
                });

                describe('when the spender had an approved amount', function () {
                    beforeEach(async function () {
                        await token.connect(initialHolder).approve(spender, new BN(1).toString());
                    });

                    it('increases the spender allowance adding the requested amount', async function () {
                        await token.connect(initialHolder).increaseAllowance(spender, amount.toString());

                        expect((await token.allowance(initialHolder.address, spender)).toString()).to.be.bignumber.equal(amount.addn(1));
                    });
                });
            });
        });

        describe('when the spender is the zero address', function () {
            const spender = ZERO_ADDRESS;

            it('reverts', async function () {
                await expectRevert.unspecified(
                    token.connect(initialHolder).increaseAllowance(spender, amount.toString()), 'ERC20: approve to the zero address',
                );
            });
        });
    });
}

module.exports = {
    allowanceERC20
};
