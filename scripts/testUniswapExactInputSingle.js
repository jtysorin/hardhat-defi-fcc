const { getNamedAccounts, ethers } = require("hardhat");
const { getWeth, AMOUNT } = require("./getWeth");
const { getUniswapV3Pool, getPoolImmutables, getSwapRouter } = require("./uniswap");

async function main() {
    await getWeth();
    const { deployer } = await getNamedAccounts();

    const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const iWeth = await ethers.getContractAt("IWeth", wethTokenAddress, deployer);

    const daiTokenAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const iDai = await ethers.getContractAt("IWeth", daiTokenAddress, deployer);

    await getBalance(iWeth, iDai, deployer);

    await getDaiPrice();

    const poolAddress = await getUniswapV3Pool(
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "0x6B175474E89094C44Da98b954EedeAC495271d0F"
    );
    const immutables = await getPoolImmutables(poolAddress);
    const swapRouter = await getSwapRouter();

    const halfWethBalance = ethers.utils.parseUnits((BigInt(AMOUNT.toString()) / 2n).toString(), 0);

    const params = {
        tokenIn: immutables.token1,
        tokenOut: immutables.token0,
        fee: immutables.fee,
        recipient: deployer,
        deadline: Math.floor(Date.now() / 1000) + 60 * 10,
        amountIn: halfWethBalance,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
    };

    console.log("Swap 1");
    await approveErc20(wethTokenAddress, swapRouter.address, halfWethBalance, deployer);
    const tx = await swapRouter.exactInputSingle(params);
    tx.wait(1);
    await getBalance(iWeth, iDai, deployer);

    console.log("Swap 2");
    await approveErc20(wethTokenAddress, swapRouter.address, halfWethBalance, deployer);
    const tx2 = await swapRouter.exactInputSingle(params);
    tx2.wait(1);
    await getBalance(iWeth, iDai, deployer);
}

async function getBalance(iWeth, iDai, account) {
    console.log(`Balance: ${(await iWeth.balanceOf(account)).toString()} WETH`);
    console.log(`Balance: ${(await iDai.balanceOf(account)).toString()} DAI`);
}

async function getDaiPrice() {
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        "0x773616E4d11A78F511299002da57A0a94577F1f4"
    );
    const price = (await daiEthPriceFeed.latestRoundData())[1];
    console.log(`The DAI/ETH price is ${price.toString()}`);
    return price;
}

async function approveErc20(erc20Address, spenderAddress, amountToSpend, account) {
    const erc20Token = await ethers.getContractAt("IERC20", erc20Address, account);
    const tx = await erc20Token.approve(spenderAddress, amountToSpend);
    await tx.wait(1);
    console.log("Approved!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
