const { BN, constants, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { ZERO_ADDRESS } = constants;

function shouldBehaveLikeERC20 (errorPrefix, initialSupply, initialHolder, recipient, anotherAccount, token) {
    describe('total supply', function () {
        it('returns the total amount of tokens', async function () {
            expect((await token.totalSupply()).toString()).to.be.bignumber.equal(initialSupply);
        });
    });

    describe('balanceOf', function () {
        describe('when the requested account has no tokens', function () {
            it('returns zero', async function () {
                expect((await token.balanceOf(anotherAccount.address)).toString()).to.be.bignumber.equal('0');
            });
        });

        describe('when the requested account has some tokens', function () {
            it('returns the total amount of tokens', async function () {
                expect((await token.balanceOf(initialHolder.address)).toString()).to.be.bignumber.equal(initialSupply);
            });
        });
    });

    describe('transfer', function () {
        shouldBehaveLikeERC20Transfer(errorPrefix, initialHolder, recipient, initialSupply,
            function (from, to, value) {
                return token.transfer(to, value, { from });
            }, token,
        );
    });

    describe('transfer from', function () {
        const spender = recipient.address;

        describe('when the token owner is not the zero address', function () {
            const tokenOwner = initialHolder.address;

            describe('when the recipient is not the zero address', function () {
                const to = anotherAccount.address;

                describe('when the spender has enough approved balance', function () {
                    beforeEach(async function () {
                        await token.connect(initialHolder).approve(spender, initialSupply.toString());
                    });

                    describe('when the token owner has enough balance', function () {
                        const amount = initialSupply.toString();

                        it('transfers the requested amount', async function () {
                            expect(await token.connect(recipient).transferFrom(tokenOwner, to, amount))
                                .to.emit(token, 'Transfer')
                                .withArgs(tokenOwner, to, amount)
                                .to.emit(token, 'Approval')
                                .withArgs(tokenOwner, spender, await token.allowance(tokenOwner, spender));
                            expect((await token.balanceOf(tokenOwner)).toString()).to.be.bignumber.equal('0');
                            expect((await token.balanceOf(to)).toString()).to.be.bignumber.equal(amount);
                            await token.connect(anotherAccount).transfer(tokenOwner, amount);
                        });

                        it('decreases the spender allowance', async function () {
                            await token.connect(recipient).transferFrom(tokenOwner, to, amount);
                            expect((await token.allowance(tokenOwner, spender)).toString()).to.be.bignumber.equal('0');
                        });
                    });

                    describe('when the token owner does not have enough balance', function () {
                        const amount = initialSupply.addn(1);

                        it('reverts', async function () {
                            await expectRevert.unspecified(token.connect(recipient).transferFrom(
                                tokenOwner, to, amount.toString()), `${errorPrefix}: transfer amount exceeds balance`,
                            );
                        });
                    });
                });

                describe('when the spender does not have enough approved balance', function () {
                    beforeEach(async function () {
                        await token.connect(initialHolder).approve(spender, initialSupply.subn(1).toString());
                    });

                    describe('when the token owner has enough balance', function () {
                        const amount = initialSupply;

                        it('reverts', async function () {
                            await expectRevert.unspecified(token.connect(recipient).transferFrom(
                                tokenOwner, to, amount.toString()), `${errorPrefix}: transfer amount exceeds allowance`,
                            );
                        });
                    });

                    describe('when the token owner does not have enough balance', function () {
                        const amount = initialSupply.addn(1);

                        it('reverts', async function () {
                            await expectRevert.unspecified(token.connect(recipient).transferFrom(
                                tokenOwner, to, amount.toString()), `${errorPrefix}: transfer amount exceeds balance`,
                            );
                        });
                    });
                });
            });

            describe('when the recipient is the zero address', function () {
                const amount = initialSupply.toString();
                const to = ZERO_ADDRESS;

                beforeEach(async function () {
                    await token.connect(initialHolder).approve(spender, amount);
                });

                it('reverts', async function () {
                    await expectRevert.unspecified(token.connect(recipient).transferFrom(
                        tokenOwner, to, amount), `${errorPrefix}: transfer to the zero address`,
                    );
                });
            });
        });

        describe('when the token owner is the zero address', function () {
            const amount = 0;
            const tokenOwner = ZERO_ADDRESS;
            const to = recipient.address;

            it('reverts', async function () {
                await expectRevert.unspecified(token.connect(recipient).transferFrom(
                    tokenOwner, to, amount), `${errorPrefix}: transfer from the zero address`,
                );
            });
        });
    });

    describe('approve', function () {
        shouldBehaveLikeERC20Approve(errorPrefix, initialHolder, recipient, initialSupply,
            function (owner, spender, amount) {
                return token.connect(owner).approve(spender, amount.toString());
            }, token,
        );
    });
}

function shouldBehaveLikeERC20Transfer (errorPrefix, initialHolder, recipient, balance, transfer, token) {
    let from = initialHolder.address;
    let to = recipient.address;
    describe('when the recipient is not the zero address', function () {
        describe('when the sender does not have enough balance', function () {
            const amount = balance.addn(1).toString();

            it('reverts', async function () {
                await expectRevert.unspecified(transfer.call(this, from, to, amount),
                    `${errorPrefix}: transfer amount exceeds balance`,
                );
            });
        });

        describe('when the sender transfers all balance', function () {
            const amount = balance.toString();

            it('transfers the requested amount', async function () {
                expect(await transfer.call(this, from, to, amount)).to.emit(token, 'Transfer').withArgs(from, to, amount);

                expect((await token.balanceOf(from)).toString()).to.be.bignumber.equal('0');

                expect((await token.balanceOf(to)).toString()).to.be.bignumber.equal(amount);

            });
        });

        describe('when the sender transfers zero tokens', function () {
            const amount = new BN('0').toString();

            it('transfers the requested amount', async function () {
                expect(await transfer.call(this, from, to, amount)).to.emit(token, 'Transfer').withArgs(from, to, amount);

                expect((await token.balanceOf(from)).toString()).to.be.bignumber.equal('0');

                expect((await token.balanceOf(to)).toString()).to.be.bignumber.equal(balance);
            });
        });
    });

    describe('when the recipient is the zero address', function () {
        it('reverts', async function () {
            await expectRevert.unspecified(transfer.call(this, from, ZERO_ADDRESS, balance.toString()),
                `${errorPrefix}: transfer to the zero address`,
            );
        });

        after(async function () {
            await token.connect(recipient).transfer(initialHolder.address, balance.toString());
        });
    });


}

function shouldBehaveLikeERC20Approve (errorPrefix, initialHolder, recipient, supply, approve, token) {

    let owner = initialHolder.address;
    let spender = recipient.address;

    describe('when the spender is not the zero address', function () {
        describe('when the sender has enough balance', function () {
            const amount = supply.toString();

            it('emits an approval event', async function () {
                expect (await approve.call(this, initialHolder, spender, amount)).to.emit(token, 'Approval').withArgs(owner, spender, amount);
            });

            describe('when there was no approved amount before', function () {
                it('approves the requested amount', async function () {
                    await approve.call(this, initialHolder, spender, amount);

                    expect((await token.allowance(owner, spender)).toString()).to.be.bignumber.equal(amount);
                });
            });

            describe('when the spender had an approved amount', function () {
                beforeEach(async function () {
                    await approve.call(this, initialHolder, spender, new BN(1).toString());
                });

                it('approves the requested amount and replaces the previous one', async function () {
                    await approve.call(this, initialHolder, spender, amount);

                    expect((await token.allowance(owner, spender)).toString()).to.be.bignumber.equal(amount);
                });
            });
        });

        describe('when the sender does not have enough balance', function () {
            const amount = supply.addn(1).toString();

            it('emits an approval event', async function () {
                expect(await approve.call(this, initialHolder, spender, amount)).to.emit(token, 'Approval').withArgs(owner, spender, amount);
            });

            describe('when there was no approved amount before', function () {
                it('approves the requested amount', async function () {
                    await approve.call(this, initialHolder, spender, amount);

                    expect((await token.allowance(owner, spender)).toString()).to.be.bignumber.equal(amount);
                });
            });

            describe('when the spender had an approved amount', function () {
                beforeEach(async function () {
                    await approve.call(this, initialHolder, spender, new BN(1).toString());
                });

                it('approves the requested amount and replaces the previous one', async function () {
                    await approve.call(this, initialHolder, spender, amount);

                    expect((await token.allowance(owner, spender)).toString()).to.be.bignumber.equal(amount);
                });
            });
        });
    });

    describe('when the spender is the zero address', function () {
        it('reverts', async function () {
            await expectRevert.unspecified(approve.call(this, initialHolder, ZERO_ADDRESS, supply),
                `${errorPrefix}: approve to the zero address`,
            );
        });
    });
}

module.exports = {
    shouldBehaveLikeERC20
};
