
const setBlockTimestampInSeconds = (startTime, seconds) => {
    return ethers.provider.send('evm_setNextBlockTimestamp', [startTime.toNumber() + seconds]);
}

const setBlockTimestampInMonth = (startTime, month) => {
    return ethers.provider.send('evm_setNextBlockTimestamp', [startTime.toNumber() + 60*60*24*30*month]);
}

const setBlockTimestampInMonthAndSeconds = (startTime, month, seconds) => {
    return ethers.provider.send('evm_setNextBlockTimestamp', [startTime.toNumber() + 60*60*24*30*month + seconds]);
}

const mintNewBlock =  () => {
    return network.provider.send("evm_mine")
}

module.exports = {
    setBlockTimestampInSeconds,
    setBlockTimestampInMonth,
    setBlockTimestampInMonthAndSeconds,
    mintNewBlock
};