const { getNamedAccounts, ethers } = require("hardhat");

async function getUniswapV3Pool(tokenAddress0, tokenAddress1, account) {
    // abi
    // contract 0x1F98431c8aD98523631AE4a59f267346ea31F984
    const uniswapV3Factory = await ethers.getContractAt(
        "IUniswapV3Factory",
        "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        account
    );

    const uniswapV3PoolAddress = await uniswapV3Factory.getPool(tokenAddress0, tokenAddress1, 3000);
    console.log(`Got the pool address: ${uniswapV3PoolAddress}`);

    const uniswapV3Pool = await ethers.getContractAt(
        "IUniswapV3Pool",
        uniswapV3PoolAddress,
        account
    );

    return uniswapV3Pool;
}

async function getPoolImmutables(uniswapV3Pool) {
    const [token0, token1, fee] = await Promise.all([
        uniswapV3Pool.token0(),
        uniswapV3Pool.token1(),
        uniswapV3Pool.fee(),
    ]);

    const immutables = {
        token0: token0,
        token1: token1,
        fee: fee,
    };
    return immutables;
}

async function getSwapRouter(account) {
    const swapRouter = await ethers.getContractAt(
        "ISwapRouter",
        "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        account
    );
    return swapRouter;
}

module.exports = {
    getUniswapV3Pool,
    getPoolImmutables,
    getSwapRouter,
};
