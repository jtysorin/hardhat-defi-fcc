const { getNamedAccounts, ethers } = require("hardhat");
const { getWeth, AMOUNT } = require("./getWeth");
const { getUniswapV3Pool, getPoolImmutables, getSwapRouter } = require("./uniswap");

async function main() {
    await getWeth();
    const { deployer } = await getNamedAccounts();

    const daiTokenAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

    const iWeth = await ethers.getContractAt("IWeth", wethTokenAddress, deployer);
    const iDai = await ethers.getContractAt("IWeth", daiTokenAddress, deployer);
    await getAccountBalance(iWeth, iDai, deployer);

    // Lending Pool Address Provider: 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    // Lending Pool: ^
    const lendingPool = await getLendingPool(deployer);
    console.log(`LendingPool address: ${lendingPool.address}`);

    // deposit!
    const amountToDeposit = ethers.utils.parseUnits((BigInt(AMOUNT.toString()) / 2n).toString(), 0);
    await approveErc20(wethTokenAddress, lendingPool.address, amountToDeposit, deployer);
    await depositWeth(lendingPool, wethTokenAddress, amountToDeposit, deployer, 0);
    await getAccountBalance(iWeth, iDai, deployer);
    let { availableBorrowsETH } = await getBorrowUserData(lendingPool, deployer);

    const daiPrice = await getDaiPrice();
    const amountDaiToBorrow = ethers.utils.parseUnits(
        (availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber())).toString(),
        18
    );
    console.log(`You can borrow ${amountDaiToBorrow} wei DAI`);

    // Borrow Time!
    // how much we have borrowed, how much we have in collateral, how much we can borrow
    await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrow, deployer);
    await getBorrowUserData(lendingPool, deployer);
    await getAccountBalance(iWeth, iDai, deployer);

    // await sleep(10000); // wait 10 sec

    // repay
    await repayDai(amountDaiToBorrow, daiTokenAddress, lendingPool, deployer);
    let { totalDebtETH } = await getBorrowUserData(lendingPool, deployer);

    await getAccountBalance(iWeth, iDai, deployer);

    const poolAddress = await getUniswapV3Pool(
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        deployer
    );
    const immutables = await getPoolImmutables(poolAddress);
    const swapRouter = await getSwapRouter(deployer);

    const daiPrice2 = await getDaiPrice();
    const totalDebtDai = ethers.utils.parseUnits(
        Math.floor(totalDebtETH.toString() * (1 / daiPrice2.toNumber()) * 10 ** 18).toString(),
        0
    );
    console.log(`You have debt worth ${totalDebtDai.toString()} wei DAI`);

    // increase the amount of WETH to swap with 0.5 % to make sure it's enough
    const amountOfWethToSwap = ethers.utils.parseUnits(
        ((BigInt(totalDebtETH.toString()) * 1005n) / 1000n).toString(),
        0
    );

    // swap WETH to DAI in order to repay the remaining DAI from the lending pool
    await swapWethToDai(
        wethTokenAddress,
        swapRouter,
        amountOfWethToSwap,
        totalDebtDai,
        deployer,
        immutables
    );
    await getAccountBalance(iWeth, iDai, deployer);

    // repay the remaining DAI
    await repayDai(totalDebtDai, daiTokenAddress, lendingPool, deployer);
    const { totalCollateralETH: totalAmountToWithdraw } = await getBorrowUserData(
        lendingPool,
        deployer
    );

    // withdraw
    await lendingPool.withdraw(wethTokenAddress, totalAmountToWithdraw, deployer);
    console.log(`You've withdrawed ${totalAmountToWithdraw} WETH`);
    await getBorrowUserData(lendingPool, deployer);
    await getAccountBalance(iWeth, iDai, deployer);
}

async function swapWethToDai(
    wethTokenAddress,
    swapRouter,
    amountOfWethToSpend,
    amountOfDaiToGet,
    account,
    immutables
) {
    await approveErc20(wethTokenAddress, swapRouter.address, amountOfDaiToGet, account);

    const params = {
        tokenIn: immutables.token1,
        tokenOut: immutables.token0,
        fee: immutables.fee,
        recipient: account,
        deadline: Math.floor(Date.now() / 1000) + 60 * 10,
        amountOut: amountOfDaiToGet,
        amountInMaximum: amountOfWethToSpend,
        sqrtPriceLimitX96: 0,
    };

    const tx = await swapRouter.exactOutputSingle(params);
    tx.wait(1);
    console.log(`${amountOfWethToSpend} WETH swaped for ${amountOfDaiToGet} DAI`);
}

async function depositWeth(lendingPool, wethTokenAddress, amount, account, refferal) {
    console.log("Depositing...");
    await lendingPool.deposit(wethTokenAddress, amount, account, refferal);
    console.log(`${amount.toString()} WETH Deposited!`);
}

function sleep(ms) {
    console.log(`Wait ${ms / 1000} seconds...`);
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function repayDai(amount, daiAddress, lendingPool, account) {
    await approveErc20(daiAddress, lendingPool.address, amount, account);
    const repayTx = await lendingPool.repay(daiAddress, amount, 1, account);
    await repayTx.wait(1);
    console.log(`You've repayed ${amount.toString()} DAI`);
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrowWei, account) {
    const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrowWei, 1, 0, account);
    await borrowTx.wait(1);
    console.log("You've borrowed!");
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

async function getAccountBalance(wethToken, daiToken, account) {
    console.log(`Balance: ${(await wethToken.balanceOf(account)).toString()} WETH`);
    console.log(`Balance: ${(await daiToken.balanceOf(account)).toString()} DAI`);
}

async function getBorrowUserData(lendingPool, account) {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account);
    console.log(`You have ${totalCollateralETH} worth of ETH deposited.`);
    console.log(`You have ${totalDebtETH} worth of ETH borrowed.`);
    console.log(`You can borrow ${availableBorrowsETH} worth of ETH.`);
    console.log("____________________________");
    return { totalCollateralETH, availableBorrowsETH, totalDebtETH };
}

async function getLendingPool(account) {
    const lendingPoolAddressProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
        account
    );

    const lendingPoolAddress = await lendingPoolAddressProvider.getLendingPool();
    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account);
    return lendingPool;
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
